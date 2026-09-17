import "server-only"

import { z } from "zod"

import { bubbleListAll, bubbleListMaybeMissing, bubbleRunWorkflow, type BubbleThing } from "@/lib/bubble/client"
import { isPickupRequest } from "@/lib/bubble/enums"
import { isAssignable, isFreeToAssign } from "@/lib/bubble/tool-enums"
import { NO_LOCATION } from "@/lib/bubble/pickup-tools-types"
import { listToolTypes } from "@/lib/bubble/reference"
import { listOpenRequestsByIds } from "@/lib/bubble/requests"
import type {
  AssignedTool,
  AssignmentEntry,
  CandidateTool,
  ToolRequestClaim,
} from "@/lib/bubble/assigned-tools-types"

export type { AssignedTool, CandidateTool, ToolRequestClaim }

/**
 * Phase 2A: which physical tools a request holds (`assignedtools`), which
 * tools it could hold (`tools`, by type) — and the one write that changes it.
 *
 * Availability used to also mean "no other request holds this tool over the
 * same dates" (`listTakenToolIds`, a date-overlap check). That was retired:
 * dates proved unreliable as a proxy for whether a tool was actually free
 * (see the reversal note on `TOOL_STATUS_NEW` in `lib/bubble/enums.ts`), and
 * availability is now simply `isFreeToAssign(statusNew)` — checked, alongside
 * `isAssignable`'s condition check, right in the candidate queries below. A
 * tool that isn't offerable is dropped from the results, not shown disabled:
 * a PM assigning tools only ever sees ones it's actually possible to add.
 *
 * Reads of `assignedtools` go through `listMaybeMissing`, which turns a 404
 * into an empty list. That was written because the UI shipped before the
 * schema (`docs/phase-2a-assignment.md` step 3) and is kept because a missing
 * type should degrade to an empty screen, not a crash.
 *
 * The write goes through a Bubble backend workflow, never `PATCH /obj/...`:
 * `create-assigned-tool` owns the delete-then-recreate that makes saving
 * idempotent, and sets `request.status` itself. Tool-status writes
 * (`markToolsAssigned`/`releaseToolsToAvailable` in `lib/bubble/requests.ts`)
 * go through the separate `update-request-status` workflow, called right
 * after by `assignToolsAction`.
 */

const ASSIGNED_TOOLS = "assignedtools"
const TOOLS = "tools"

const assignedToolRow = z.looseObject({
  _id: z.string(),
  requestID: z.string().optional(),
  toolID: z.string().optional(),
  toolType: z.string().optional(),
  extra: z.boolean().optional(),
})

const toolRow = z.looseObject({
  _id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  /** The original option set. Still written by the old Bubble UI; not read here. */
  status: z.string().optional(),
  /**
   * `ToolStatusNew` — the phase 2 lifecycle field, and the one this module
   * reads. Backfilled from `status` on every live row, so an empty value is a
   * data gap rather than the norm.
   */
  statusNew: z.string().optional(),
  /** `ToolCondition` — split off `statusNew` in phase 3A. See `lib/bubble/enums.ts`. */
  condition: z.string().optional(),
  floor: z.string().optional(),
  currentUser: z.string().optional(),
})

/** Every `assignedtools` row for these requests, in one `in` query. */
export async function listAssignedTools(requestIds: string[]): Promise<AssignedTool[]> {
  if (requestIds.length === 0) return []

  const rows = await bubbleListMaybeMissing(ASSIGNED_TOOLS, {
    constraints: [{ key: "requestID", constraint_type: "in", value: requestIds }],
  })

  return rows
    .map((raw) => assignedToolRow.parse(raw))
    .filter((row) => row.requestID && row.toolID)
    .map((row) => ({
      id: row._id,
      requestId: row.requestID!,
      toolId: row.toolID!,
      toolType: row.toolType ?? "",
      extra: row.extra ?? false,
    }))
}

/**
 * Which of these tools a **different open request** already holds — the
 * assign screen's warning, and the exact counterpart of `listToolClaims`.
 *
 * Two reads, because Bubble cannot join: the `assignedtools` rows pointing at
 * these tools, then the requests those rows belong to, keeping only the open
 * ones (`listOpenRequestsByIds`). A `Delivered`/`Returned` request releases its
 * tools, which is what stops every tool that has ever been on a job from
 * reading as claimed forever.
 *
 * `excludeRequestId` is the request being edited. Its own `assignedtools` rows
 * are not a conflict with itself — without this every tool already on the
 * request would warn about the request you are looking at.
 *
 * Deliberately **not** wired into `assignToolsAction`'s guards. This is
 * information, not a gate: see `ToolRequestClaim` for why double-booking stays
 * legal and where it is actually refused (`validatePlan`'s `duplicate-tool`).
 *
 * First claim wins when a tool is somehow on three requests — the warning names
 * one, and naming one is enough to send the PM looking.
 */
export async function listRequestClaims(
  toolIds: readonly string[],
  excludeRequestId?: string
): Promise<Map<string, ToolRequestClaim>> {
  if (toolIds.length === 0) return new Map()

  const rows = await bubbleListMaybeMissing(ASSIGNED_TOOLS, {
    constraints: [{ key: "toolID", constraint_type: "in", value: [...toolIds] }],
  })

  const wanted = new Set(toolIds)
  const held = rows
    .map((raw) => assignedToolRow.parse(raw))
    .filter(
      (row) => row.requestID && row.toolID && row.requestID !== excludeRequestId && wanted.has(row.toolID)
    )
  if (held.length === 0) return new Map()

  const open = new Map(
    (await listOpenRequestsByIds([...new Set(held.map((row) => row.requestID!))])).map((request) => [
      request.id,
      request,
    ])
  )

  const byTool = new Map<string, ToolRequestClaim>()
  for (const row of held) {
    const request = open.get(row.requestID!)
    if (!request || byTool.has(row.toolID!)) continue
    byTool.set(row.toolID!, {
      toolId: row.toolID!,
      requestId: request.id,
      job: request.job,
      pickup: isPickupRequest(request),
    })
  }
  return byTool
}

/**
 * Every **open** request holding any of these tools — `listAssignedTools` read
 * backwards, tools to requests.
 *
 * Written for the trip lifecycle's status sync, which otherwise only knows the
 * requests its own `triptool` rows name. A `triptool` row carries exactly one
 * `requestId`, and a site-to-site transfer collapses a tool's pickup leg and
 * delivery leg into one row (see `oneJourney`), so the pickup request that
 * freed the tool is *not* named anywhere on the trip that satisfies it. Moving
 * the tool would leave that request reading its old status until something
 * else happened to touch it.
 *
 * Closed requests are filtered out by `listOpenRequestsByIds`: recomputing one
 * is a wasted round trip, since `deriveRequestStatus` ratchets and would return
 * the terminal value unchanged.
 */
export async function listOpenRequestIdsForTools(toolIds: readonly string[]): Promise<string[]> {
  if (toolIds.length === 0) return []

  const rows = await bubbleListMaybeMissing(ASSIGNED_TOOLS, {
    constraints: [{ key: "toolID", constraint_type: "in", value: [...toolIds] }],
  })

  const wanted = new Set(toolIds)
  const requestIds = [
    ...new Set(
      rows
        .map((raw) => assignedToolRow.parse(raw))
        .filter((row) => row.requestID && row.toolID && wanted.has(row.toolID))
        .map((row) => row.requestID!)
    ),
  ]

  return (await listOpenRequestsByIds(requestIds)).map((request) => request.id)
}

function toCandidate(row: z.infer<typeof toolRow>, typeNameById: Map<string, string>): CandidateTool {
  return {
    id: row._id,
    name: row.name!,
    typeId: row.type ?? null,
    typeName: row.type ? (typeNameById.get(row.type) ?? null) : null,
    // `statusNew`, so the screen shows the same field `isAssignable` hides on.
    // Empty rather than a stand-in value: after the backfill a blank one means
    // the row was missed, and inventing "Available" for it would hide that.
    status: row.statusNew ?? "",
    condition: row.condition ?? "",
    location: row.location?.trim() ? row.location.trim() : NO_LOCATION,
    floor: row.floor ?? null,
    currentUser: row.currentUser?.trim() || null,
  }
}

function sortCandidates(tools: CandidateTool[]): CandidateTool[] {
  return tools.sort((a, b) => (a.typeName ?? "").localeCompare(b.typeName ?? "") || a.name.localeCompare(b.name))
}

/**
 * The physical tools belonging to any of these `toolstype` rows.
 *
 * `type` is a **link**, and `in` is only proven against plain text in this
 * repo (`withLines`), so the result is re-filtered in JS: if Bubble ignores the
 * constraint and hands back the whole table, the filter still yields the right
 * tools. The empty-result fallback covers the other failure — a constraint
 * Bubble understands as "match nothing" — at the cost of one full read, which
 * only happens when the narrow query returned nothing at all.
 *
 * Two filters, both applied here: `isAssignable` drops a tool whose
 * *condition* is wrong (needs repair, full stop), `isFreeToAssign` drops one
 * whose *flow state* is already claimed elsewhere (`Assigned`, `In Transit`,
 * `Delivered`). A tool already on file for *this* request doesn't come
 * through here at all — the assign page merges it in separately, by id
 * (`listToolsByIds`), so it stays pickable regardless of its live status.
 */
export async function listCandidateTools(typeIds: string[]): Promise<CandidateTool[]> {
  if (typeIds.length === 0) return []

  const wanted = new Set(typeIds)
  const [toolTypes, narrow] = await Promise.all([
    listToolTypes(),
    bubbleListAll(TOOLS, {
      constraints: [{ key: "type", constraint_type: "in", value: typeIds }],
    }),
  ])

  let rows: BubbleThing[] = narrow
  if (rows.length === 0) {
    console.warn("[assigned-tools] `type in [...]` returned no tools — falling back to a full read.")
    rows = await bubbleListAll(TOOLS, {})
  }

  const typeNameById = new Map(toolTypes.map((type) => [type.id, type.name]))

  return sortCandidates(
    rows
      .map((raw) => toolRow.parse(raw))
      .filter((row) => row.name && row.type && wanted.has(row.type))
      .filter((row) => isAssignable(row.condition ?? "", row.statusNew ?? "") && isFreeToAssign(row.statusNew ?? ""))
      .map((row) => toCandidate(row, typeNameById))
  )
}

/**
 * The named `tools` rows, whatever their type.
 *
 * What resolves an *extra* — a tool assigned to the request that no requested
 * type covers, so `listCandidateTools` never returns it — into something with
 * a name to show. Same belt-and-braces as `listCandidateTools`: the `in`
 * result is re-filtered in JS and an empty answer falls back to a full read.
 *
 * No condition filter: a tool already on the request is shown even if it has
 * since been marked for repair. Hiding it would make it un-unassignable.
 */
export async function listToolsByIds(ids: string[]): Promise<CandidateTool[]> {
  if (ids.length === 0) return []

  const wanted = new Set(ids)
  const [toolTypes, narrow] = await Promise.all([
    listToolTypes(),
    bubbleListAll(TOOLS, {
      constraints: [{ key: "_id", constraint_type: "in", value: ids }],
    }),
  ])

  let rows: BubbleThing[] = narrow
  if (rows.length === 0) {
    console.warn("[assigned-tools] `_id in [...]` returned no tools — falling back to a full read.")
    rows = await bubbleListAll(TOOLS, {})
  }

  const typeNameById = new Map(toolTypes.map((type) => [type.id, type.name]))

  return sortCandidates(
    rows
      .map((raw) => toolRow.parse(raw))
      .filter((row) => row.name && wanted.has(row._id))
      .map((row) => toCandidate(row, typeNameById))
  )
}

/**
 * Free-text tool search, for the "Add extra tool" dialog.
 *
 * Deliberately **not** constrained by `type`: tools with a blank or dangling
 * `type` are invisible to `listCandidateTools` and this is how they stay
 * reachable. Condition and free-to-assign both still apply, same as there.
 */
export async function searchTools(query: string, limit = 50): Promise<CandidateTool[]> {
  const needle = query.trim()
  if (needle.length < 2) return []

  const [toolTypes, rows] = await Promise.all([
    listToolTypes(),
    bubbleListAll(TOOLS, {
      constraints: [{ key: "name", constraint_type: "text contains", value: needle }],
    }),
  ])

  const typeNameById = new Map(toolTypes.map((type) => [type.id, type.name]))

  return sortCandidates(
    rows
      .map((raw) => toolRow.parse(raw))
      .filter((row) => row.name)
      .filter((row) => isAssignable(row.condition ?? "", row.statusNew ?? "") && isFreeToAssign(row.statusNew ?? ""))
      .map((row) => toCandidate(row, typeNameById))
  ).slice(0, limit)
}

// Pinned to a constant for the same reason `NEW_REQUEST_WORKFLOW` is: a
// renamed workflow fails as a 404 at runtime, not at build. This one earned it
// — the as-built names came out swapped from the design's, so the *public*
// endpoint is the singular-sounding `create-assigned-tool` and the private
// per-item helper is `assign-request-tool`. Never call the helper from here:
// it creates one row without the delete-first step that makes saving
// idempotent.
const CREATE_ASSIGNED_TOOL_WORKFLOW = "create-assigned-tool"

/** `{ ok, count }`, loose because only `count` is acted on. */
const assignResult = z.looseObject({ count: z.number() })

/**
 * Replaces this request's entire assignment set and sets
 * `request.status = "Assigned"`.
 *
 * The workflow deletes the request's existing `assignedtools` rows before
 * recreating them, which is what makes this **idempotent** — `client.ts`
 * retries a POST on 429/5xx up to four times, so a 502-after-commit would
 * otherwise double every row. Saving is always a wholesale replace, so removing
 * a tool and saving is also how an unassign happens.
 *
 * The returned `count` is checked against what was sent: the row creates are a
 * *Schedule API Workflow on a list* inside Bubble, and a mismatch is the only
 * signal that some of them didn't run. The fix is to save again, which the
 * delete-first step makes safe.
 *
 * `entries` goes on the wire **as-is**. The workflow's `assignments` parameter
 * was defined with Bubble's Detect Data as a list of objects, so it takes the
 * `AssignmentEntry` shape directly — no delimited encoding, unlike the Pickup
 * flow's `tool-status-updates.ts`.
 *
 * This does not itself write any tool's `statusNew` — `request.status` is set
 * to `Assigned` by the workflow's own last step, not from here.
 * `assignToolsAction` (`app/(app)/requests/[requestId]/assign/actions.ts`) is
 * what writes `statusNew`, in a separate call right after this one succeeds,
 * via `markToolsAssigned`/`releaseToolsToAvailable`.
 */
export async function assignTools(requestId: string, entries: readonly AssignmentEntry[]): Promise<void> {
  const raw = await bubbleRunWorkflow(CREATE_ASSIGNED_TOOL_WORKFLOW, {
    requestId,
    assignments: entries,
  })
  const result = assignResult.parse(raw)

  if (result.count !== entries.length) {
    throw new Error(
      `Bubble accepted ${result.count} of ${entries.length} assignments. Save again to retry — it replaces the whole set rather than adding to it.`
    )
  }
}
