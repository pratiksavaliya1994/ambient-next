import "server-only"

import { bubbleList, bubbleListAll, type BubbleThing, type Constraint } from "@/lib/bubble/client"
import { newYorkDayAfter, newYorkDaysAgo, newYorkInstant } from "@/lib/bubble/dates"
import { isOpenRequest, REQUEST_STATUS } from "@/lib/bubble/enums"
import { REQUEST, requestRow, withLines, type ToolRequest } from "@/lib/bubble/requests"

/**
 * The two reads behind `/requests`' tabs: every *active* request in one go
 * (the Active tab filters it in the browser), and one *page* of the whole
 * table (the All tab searches and pages on the server).
 */

/**
 * How far back a request with **no `status` at all** still counts as active.
 *
 * A blank status reads as `New` (`DEFAULT_REQUEST_STATUS`), and rows created
 * through this app today still land blank until someone assigns them — so a
 * blank row can be a real, waiting request. But ~1,740 of the ~1,830 live rows
 * are blank, almost all legacy rows from before phase 2 that nothing will ever
 * close; counting every one as active would bury the dozen that are. A row
 * with an explicit open status is active however old it is.
 */
const BLANK_STATUS_ACTIVE_DAYS = 30

const OPEN_STATUSES = REQUEST_STATUS.filter(isOpenRequest)

const NEWEST_FIRST = { sortField: "Created Date", descending: true } as const

function byCreatedDesc(a: BubbleThing, b: BubbleThing) {
  return String(b["Created Date"] ?? "").localeCompare(String(a["Created Date"] ?? ""))
}

/**
 * Every request whose lifecycle isn't over, newest first, with lines attached.
 *
 * Two queries because Bubble AND's one constraint array and has no OR: every
 * row at an explicit open status, plus blank-status rows created inside
 * `BLANK_STATUS_ACTIVE_DAYS` that carry a job (a blank row with no job is one
 * of the abandoned rows `hasContent` exists to drop). The two can't overlap —
 * one needs a status, the other needs none.
 */
export async function listActiveRequests(): Promise<ToolRequest[]> {
  const since = newYorkInstant(newYorkDaysAgo(BLANK_STATUS_ACTIVE_DAYS - 1))
  const [withStatus, blank] = await Promise.all([
    bubbleListAll(REQUEST, {
      constraints: [{ key: "status", constraint_type: "in", value: [...OPEN_STATUSES] }],
      ...NEWEST_FIRST,
    }),
    bubbleListAll(REQUEST, {
      constraints: [
        { key: "status", constraint_type: "is_empty" },
        { key: "job", constraint_type: "is_not_empty" },
        { key: "Created Date", constraint_type: "greater than", value: since.toISOString() },
      ],
      ...NEWEST_FIRST,
    }),
  ])

  const rows = [...withStatus, ...blank].sort(byCreatedDesc)
  return withLines(rows.map((row) => requestRow.parse(row)))
}

export type RequestPageParams = {
  query?: string
  from?: string
  to?: string
  /** 1-based. */
  page: number
  pageSize: number
}

export type RequestPage = { requests: ToolRequest[]; total: number }

/** The four fields a search sweeps — one `text contains` query per field,
 *  since Bubble constraints in one array are AND'd and there is no OR. */
const SEARCH_FIELDS = ["job", "fieldPM2", "contact", "floor"] as const

/**
 * Bounds on `requestDateStart` — the drop/pickup instant every card leads
 * with — not `Created Date`, so a range answers "what is moving that week".
 *
 * Both bounds are New York wall-clock days, and Bubble's date constraints have
 * no inclusive form: `to` compares against midnight of the day *after* it, and
 * `from` against a millisecond before its own midnight — a slot hour of 0 is
 * legal, so `requestDateStart` can land exactly on midnight. A row carrying
 * only `requestDateEnd` is therefore unfindable by date; covering it would
 * cost a second fan-out for a case only legacy rows can be in.
 */
function dateConstraints(from?: string, to?: string): Constraint[] {
  const constraints: Constraint[] = []
  if (from) {
    constraints.push({
      key: "requestDateStart",
      constraint_type: "greater than",
      value: new Date(newYorkInstant(from).getTime() - 1).toISOString(),
    })
  }
  if (to) {
    constraints.push({
      key: "requestDateStart",
      constraint_type: "less than",
      value: newYorkInstant(newYorkDayAfter(to)).toISOString(),
    })
  }
  return constraints
}

/**
 * One page of the whole `request` table, newest first, optionally narrowed by
 * free text (job, PM, contact, floor) and a drop/pickup date range.
 *
 * Rows with no job are left out on the server rather than dropped after the
 * page comes back — roughly half the table is abandoned blanks, and filtering
 * after paging would leave pages half empty.
 *
 * With no text this is real Bubble paging: one `bubbleList` at the page's
 * offset, whose `remaining` gives the total. With text it can't be — the
 * fields are OR'd, which Bubble can't express, so each field is swept in full,
 * unioned by `_id`, and the page sliced out here. Either way only the page's
 * own rows pay for `withLines`.
 */
export async function pageRequests({ query, from, to, page, pageSize }: RequestPageParams): Promise<RequestPage> {
  const base: Constraint[] = [...dateConstraints(from, to), { key: "job", constraint_type: "is_not_empty" }]
  const offset = (page - 1) * pageSize
  const trimmed = query?.trim()

  if (!trimmed) {
    const result = await bubbleList(REQUEST, { constraints: base, limit: pageSize, cursor: offset, ...NEWEST_FIRST })
    // Past the last page Bubble reports nothing left, which says nothing about
    // how many rows there were — ask again from the top for the real total.
    if (result.count === 0 && offset > 0) {
      const head = await bubbleList(REQUEST, { constraints: base, limit: 1 })
      return { requests: [], total: head.count + head.remaining }
    }
    const requests = await withLines(result.results.map((row) => requestRow.parse(row)))
    return { requests, total: offset + result.count + result.remaining }
  }

  const sweeps = await Promise.all(
    SEARCH_FIELDS.map((field) =>
      bubbleListAll(REQUEST, {
        constraints: [...base, { key: field, constraint_type: "text contains", value: trimmed }],
        ...NEWEST_FIRST,
      })
    )
  )
  const byId = new Map<string, BubbleThing>()
  for (const sweep of sweeps) for (const row of sweep) byId.set(row._id, row)
  const rows = [...byId.values()].sort(byCreatedDesc)

  const requests = await withLines(rows.slice(offset, offset + pageSize).map((row) => requestRow.parse(row)))
  return { requests, total: rows.length }
}
