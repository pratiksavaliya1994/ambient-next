import "server-only"

import { z } from "zod"

import { bubbleGet, bubbleList, bubbleListAll, bubbleRunWorkflow, type BubbleThing, type Constraint } from "@/lib/bubble/client"
import { newYorkInstant, newYorkStamp } from "@/lib/bubble/dates"
import {
  DEFAULT_REQUEST_ORDER,
  DEFAULT_REQUEST_STATUS,
  isOpenRequest,
  REQUEST_STATUS,
  requestColor,
  type RequestStatus,
} from "@/lib/bubble/enums"
import {
  TOOL_STATUS_ASSIGNED,
  TOOL_STATUS_AVAILABLE,
  TOOL_STATUS_DELIVERED,
  TOOL_STATUS_IN_TRANSIT,
  TOOL_STATUS_PICKUP_REQUESTED,
} from "@/lib/bubble/tool-enums"
import type { Job } from "@/lib/bubble/reference-types"
import { listMaterialLines } from "@/lib/bubble/requested-materials"
import {
  formatMaterialsSummary,
  type MaterialLine,
  type ResolvedMaterialLine,
} from "@/lib/bubble/requested-materials-types"
import { formatToolConditionUpdates } from "@/lib/bubble/tool-status-updates"
import { formatToolsSummary, parseToolsSummary, type ToolLine } from "@/lib/bubble/tools-summary"
import { toNewRequestMaterialLines } from "@/lib/schemas/material"
import type { RequestFormValues } from "@/lib/schemas/request"
import type { PickupRequestFormValues } from "@/lib/schemas/pickup-request"

/**
 * Reading and writing `request` + `requestedtools`.
 *
 * Bubble's field names are the awkward part and are named once, here. Two of
 * them are worth knowing before changing anything:
 *
 * - `job` is the job *name* as text, not a link to `jobs`.
 * - `requestedtools.requestID` is the request `_id` as text, again not a link,
 *   so there is no referential integrity to lean on.
 *
 * `Created By` is set by Bubble to whoever owns the API token, never to the
 * signed-in person, and this schema has no field for a requester. The PM on a
 * request is therefore whatever `fieldPM2` says, and nothing else.
 */

export const REQUEST = "request"
const REQUESTED_TOOLS = "requestedtools"

export const requestRow = z.looseObject({
  _id: z.string(),
  "Created Date": z.string().optional(),
  job: z.string().optional(),
  // The GC as typed on the request — seeded from `jobs.gc`, editable per
  // request. The old Bubble UI filled it too, so older rows carry it.
  realGC: z.string().optional(),
  toDo: z.string().optional(),
  weAre: z.string().optional(),
  floor: z.string().optional(),
  contact: z.string().optional(),
  contactPhone: z.string().optional(),
  fieldPM2: z.string().optional(),
  notes: z.string().optional(),
  timeRange: z.string().optional(),
  delivery: z.boolean().optional(),
  pickup: z.boolean().optional(),
  tentative: z.boolean().optional(),
  completed: z.boolean().optional(),
  requestDate: z.string().optional(),
  requestDateStart: z.string().optional(),
  requestDateEnd: z.string().optional(),
  // Phase 2. Both are plain text in Bubble and neither exists on the live
  // schema yet, so both are absent on every row today and read as their
  // defaults. `status` is an enum rather than a string on purpose: it is text
  // precisely so that an unexpected value fails loudly here instead of
  // silently on a Bubble option-set write.
  status: z.enum(REQUEST_STATUS).optional(),
  driver: z.string().optional(),
  // Pre-existing, unlike the two above: every live row carries `100`. Read back
  // now because it doubles as the driver's stop sequence on `/dispatch/active`
  // — see `isSequenced` and `lib/dispatch/stop-order.ts`.
  order: z.number().optional(),
})

const requestedToolsRow = z.looseObject({
  _id: z.string(),
  requestID: z.string().optional(),
  toolsSummary: z.string().optional(),
  toolsNotes: z.string().optional(),
})

export type ToolRequest = {
  id: string
  createdAt: string | null
  job: string
  /** `request.realGC`. */
  gc: string | null
  toDo: string | null
  weAre: string | null
  floor: string | null
  contact: string | null
  contactPhone: string | null
  fieldPm: string | null
  notes: string | null
  timeRange: string | null
  delivery: boolean
  pickup: boolean
  tentative: boolean
  completed: boolean
  /** `requestDateStart` — the delivery instant (start date + slot time). */
  start: string | null
  /** `requestDateEnd` — midnight New York on the day tools are needed until, no time of its own. */
  end: string | null
  tools: ToolLine[]
  toolsNotes: string | null
  /** Phase 5 structured lines — see `lib/bubble/requested-materials.ts`. */
  materialLines: MaterialLine[]
  /**
   * The legacy free-text note, one entry per line. Empty whenever
   * `materialLines` isn't: requests created before 2026-09-25 carry the lines'
   * summary as a legacy row too, and showing it beside the lines would list
   * everything twice.
   */
  legacyMaterials: string[]
  /** Phase 2 lifecycle. A row with no `status` is `New`. */
  status: RequestStatus
  /** Phase 2B. The driver/PM's name, same free-text convention as `fieldPM2`. */
  driver: string | null
  /**
   * `request.order` — this request's position on its driver's trip, offset
   * above `STOP_ORDER_BASE` (stop 1 is `101`). `100` means never sequenced,
   * which is every row that predates this; `isSequenced` is the test.
   */
  order: number
}

/** Stands in for `request.job` when the Bubble row has none. */
const NO_JOB = "(no job)"

/**
 * Whether a row has anything worth putting on screen.
 *
 * The live app is full of abandoned rows: 21 of the 40 most recently created
 * carry no job, no delivery or pickup flag, no slot and no tool line, so a card
 * for one is blank apart from "(no job)". A caller showing a fixed number of
 * requests should over-fetch and drop these rather than fill the screen with
 * them. Nothing here writes such a row — they predate this app.
 */
export function hasContent(request: ToolRequest): boolean {
  return (
    request.job !== NO_JOB ||
    request.delivery ||
    request.pickup ||
    request.start !== null ||
    request.tools.length > 0 ||
    request.materialLines.length > 0 ||
    request.legacyMaterials.length > 0
  )
}

function toToolRequest(
  row: z.infer<typeof requestRow>,
  lines: ToolLine[],
  toolsNotes: string | null,
  materials: { lines: MaterialLine[]; legacy: string[] }
): ToolRequest {
  return {
    id: row._id,
    createdAt: row["Created Date"] ?? null,
    job: row.job ?? NO_JOB,
    gc: row.realGC?.trim() || null,
    toDo: row.toDo ?? null,
    weAre: row.weAre ?? null,
    floor: row.floor ?? null,
    contact: row.contact ?? null,
    contactPhone: row.contactPhone ?? null,
    fieldPm: row.fieldPM2 ?? null,
    notes: row.notes?.trim() ? row.notes.trim() : null,
    timeRange: row.timeRange ?? null,
    delivery: row.delivery ?? false,
    pickup: row.pickup ?? false,
    tentative: row.tentative ?? false,
    completed: row.completed ?? false,
    start: row.requestDateStart ?? null,
    end: row.requestDateEnd ?? null,
    tools: lines,
    toolsNotes,
    materialLines: materials.lines,
    legacyMaterials: materials.legacy,
    status: row.status ?? DEFAULT_REQUEST_STATUS,
    driver: row.driver?.trim() || null,
    // Defaulting to the constant rather than `null` keeps this a plain number,
    // so "absent" and "never sequenced" are the same case downstream.
    order: row.order ?? DEFAULT_REQUEST_ORDER,
  }
}

/**
 * The most recent requests with their tool lines attached.
 *
 * Two lookups, not one per request: the tool rows all come back from one `in`
 * query keyed on the request ids. A request can carry more than one
 * `requestedtools` row (the Bubble UI writes a fresh one on each submit), so
 * the lines are merged and the quantities summed rather than the last row
 * winning.
 */
export async function listRecentRequests(limit = 25): Promise<ToolRequest[]> {
  const page = await bubbleList(REQUEST, {
    limit,
    sortField: "Created Date",
    descending: true,
  })

  return withLines(page.results.map((row: BubbleThing) => requestRow.parse(row)))
}

/**
 * One request with its tool and material lines, for the detail and assign
 * screens.
 *
 * Goes through the same `withLines` helper as the list calls, with a one-row
 * array, rather than reading the request's `requestedtools` row directly: a
 * request can carry several of them (the Bubble UI writes a fresh one per
 * submit) and only `withLines` merges the lines and sums the quantities. An
 * assign screen reading one row would silently offer fewer slots than were
 * asked for.
 *
 * Two calls, not one — `bubbleGet` for the header, then the `in` lookups.
 */
export async function getRequest(id: string): Promise<ToolRequest | null> {
  const row = await bubbleGet(REQUEST, id)
  if (!row) return null

  const [request] = await withLines([requestRow.parse(row)])
  return request ?? null
}

/**
 * Every request at a given lifecycle `status`, optionally narrowed to one
 * driver's manifest — the Dispatch board's "ready to dispatch" list
 * (`listRequestsByStatus("Assigned")`) and a driver's live trip
 * (`listRequestsByStatus("In Transit", driverName)`).
 *
 * `status` is text, not an option set (see `REQUEST_STATUS`), so this is a
 * plain `equals` constraint with no unrecognised-value risk. The ~1,550
 * pre-phase-2 rows carry no `status` at all — `toToolRequest` reads that as
 * `New`, but nothing here needs to special-case them, since a row with no
 * `status` simply never matches `"Assigned"` / `"In Transit"` / `"Delivered"`.
 */
export async function listRequestsByStatus(status: RequestStatus, driver?: string): Promise<ToolRequest[]> {
  const constraints: Constraint[] = [{ key: "status", constraint_type: "equals", value: status }]
  if (driver) constraints.push({ key: "driver", constraint_type: "equals", value: driver })

  const rows = await bubbleListAll(REQUEST, {
    constraints,
    sortField: "Created Date",
    descending: true,
  })

  return withLines(rows.map((row: BubbleThing) => requestRow.parse(row)))
}

/**
 * `listRequestsByStatus` over several statuses as **one** `in` query and one
 * `withLines`. Per-status calls each pay their own `requestedtools` and
 * `requestedmaterials` reads, so four statuses cost twelve paginated queries
 * instead of three. On a low Bubble tier that difference shows up as 429 backoff.
 */
export async function listRequestsByStatuses(statuses: readonly RequestStatus[]): Promise<ToolRequest[]> {
  if (statuses.length === 0) return []

  const rows = await bubbleListAll(REQUEST, {
    constraints: [{ key: "status", constraint_type: "in", value: [...statuses] }],
    sortField: "Created Date",
    descending: true,
  })

  return withLines(rows.map((row: BubbleThing) => requestRow.parse(row)))
}

/**
 * Just enough of a request to *name* it — no `requestedtools` or
 * `requestedmaterials` read, which is the entire reason this exists beside
 * `withLines`.
 *
 * `listRequestClaims` resolves one of these per open request holding a
 * candidate tool, purely to render "already on <job>". Paying `withLines`'
 * two extra paginated reads for a string the caller only prints would make a
 * warning cost more than the screen it sits on.
 */
export type RequestBrief = {
  id: string
  job: string
  status: RequestStatus
  delivery: boolean
  pickup: boolean
  /** `requestDateStart`. The transfer picker shows it as the pickup's due date. */
  start: string | null
}

/**
 * The still-open requests among these ids. Closed ones are dropped here rather
 * than by the caller: a `Delivered` or `Returned` request holds nothing, and a
 * tool it once carried is free.
 */
export async function listOpenRequestsByIds(ids: readonly string[]): Promise<RequestBrief[]> {
  if (ids.length === 0) return []

  const rows = await bubbleListAll(REQUEST, {
    constraints: [{ key: "_id", constraint_type: "in", value: [...ids] }],
  })

  return rows
    .map((raw: BubbleThing) => requestRow.parse(raw))
    .map((row) => ({
      id: row._id,
      job: row.job?.trim() || NO_JOB,
      // Same default as `toToolRequest`: the ~1,550 legacy rows carry no
      // `status` at all and read as `New`, which is open.
      status: row.status ?? DEFAULT_REQUEST_STATUS,
      delivery: row.delivery ?? false,
      pickup: row.pickup ?? false,
      start: row.requestDateStart ?? null,
    }))
    .filter((request) => isOpenRequest(request.status))
}

/** Just enough of a request to say *whose* it is, and who to ask for on site. */
export type RequestStopInfo = {
  id: string
  job: string
  contact: string | null
  contactPhone: string | null
  floor: string | null
  /** The request's direction flags — `completeStopAction` routes material rows by them (5F). */
  delivery: boolean
  pickup: boolean
}

/**
 * The same shallow read as `listOpenRequestsByIds` — no `requestedtools` or
 * `requestedmaterials` — but nothing is dropped by status: a run sheet still
 * wants to say which request a tool belonged to after that request has
 * closed.
 */
export async function listRequestStopInfo(ids: readonly string[]): Promise<RequestStopInfo[]> {
  if (ids.length === 0) return []

  const rows = await bubbleListAll(REQUEST, {
    constraints: [{ key: "_id", constraint_type: "in", value: [...ids] }],
  })

  return rows.map((raw: BubbleThing) => requestRow.parse(raw)).map((row) => ({
    id: row._id,
    job: row.job?.trim() || NO_JOB,
    contact: row.contact?.trim() || null,
    contactPhone: row.contactPhone?.trim() || null,
    floor: row.floor?.trim() || null,
    delivery: row.delivery ?? false,
    pickup: row.pickup ?? false,
  }))
}

/** Who to ask for at a job site, taken from the job's most recent request. */
export type SiteContact = {
  contact: string | null
  contactPhone: string | null
}

const jobLastRequestRow = z.looseObject({
  name: z.string().optional(),
  lastRequest: z.string().optional(),
})

/**
 * Each job site's contact, keyed by job name — for the stops where the
 * trip's own requests can't say (see `isTransferCollect`).
 *
 * Read through `jobs.lastRequest`, which the `new-request` workflow keeps
 * current, so it is whoever was named on the last request raised for that
 * site. A site with no `lastRequest`, or whose request names neither a contact
 * nor a phone, is left out: showing nothing beats showing the wrong person.
 */
export async function listSiteContacts(sites: readonly string[]): Promise<Map<string, SiteContact>> {
  if (sites.length === 0) return new Map()

  const jobs = (
    await bubbleListAll("jobs", {
      constraints: [{ key: "name", constraint_type: "in", value: [...sites] }],
    })
  ).map((row) => jobLastRequestRow.parse(row))

  // Job names aren't unique in Bubble; the first row that has a request wins.
  const lastRequestBySite = new Map<string, string>()
  for (const job of jobs) {
    const lastRequest = job.lastRequest?.trim()
    if (job.name && lastRequest && !lastRequestBySite.has(job.name)) lastRequestBySite.set(job.name, lastRequest)
  }

  const requests = new Map(
    (await listRequestStopInfo([...new Set(lastRequestBySite.values())])).map((request) => [request.id, request])
  )

  const contacts = new Map<string, SiteContact>()
  for (const [site, requestId] of lastRequestBySite) {
    const request = requests.get(requestId)
    if (!request || (!request.contact && !request.contactPhone)) continue
    contacts.set(site, { contact: request.contact, contactPhone: request.contactPhone })
  }
  return contacts
}

/** The second half of every list call: one `in` lookup each for tools and materials. */
export async function withLines(rows: z.infer<typeof requestRow>[]): Promise<ToolRequest[]> {
  const ids = rows.map((row) => row._id)
  if (ids.length === 0) return []

  // Paged through rather than capped at one page: several `requestedtools`
  // rows per request means a single 100-row page runs out before the last
  // request does, which showed up as cards claiming "No tools listed".
  const [toolRows, materialsByRequest] = await Promise.all([
    bubbleListAll(REQUESTED_TOOLS, {
      constraints: [{ key: "requestID", constraint_type: "in", value: ids }],
    }),
    listMaterialLines(ids),
  ])

  const byRequest = new Map<string, { lines: Map<string, number>; notes: string[] }>()
  for (const raw of toolRows) {
    const row = requestedToolsRow.parse(raw)
    if (!row.requestID) continue

    const bucket = byRequest.get(row.requestID) ?? {
      lines: new Map<string, number>(),
      notes: [],
    }
    for (const line of parseToolsSummary(row.toolsSummary)) {
      bucket.lines.set(line.name, (bucket.lines.get(line.name) ?? 0) + line.quantity)
    }
    if (row.toolsNotes?.trim()) bucket.notes.push(row.toolsNotes.trim())
    byRequest.set(row.requestID, bucket)
  }

  return rows.map((row) => {
    const bucket = byRequest.get(row._id)
    const lines = [...(bucket?.lines ?? [])]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return toToolRequest(
      row,
      lines,
      bucket?.notes.join("\n\n") || null,
      materialsByRequest.get(row._id) ?? { lines: [], legacy: [] }
    )
  })
}

export type CreatedRequest = {
  requestId: string
  job: string
  /** Structured material lines `new-request` said it queued — what was sent, not what has landed. */
  materialLines: number
}

// Named `create-request` during the original spec; renamed to `new-request`
// partway through the Bubble Studio build. Every call goes through this one
// constant so that drift can't happen again.
const NEW_REQUEST_WORKFLOW = "new-request"

// A separate Bubble Studio workflow, mirroring `new-request`'s steps for the
// Pickup flow (built there, not in this repo) — see
// `bubble-new-request-workflow-summary.md` for the steps to mirror.
const NEW_PICKUP_REQUEST_WORKFLOW = "new-pickup-request"

/**
 * The hour (New York) every new request's `requestDateStart` lands on. The
 * form's time is free text a PM may leave blank, so it can't supply one, but
 * ClickUp and the Calendar step read `requestDateStart` as an appointment and
 * need an instant. 6 a.m. is the first slot on the Bubble calendar.
 */
const DEFAULT_START_HOUR = 6

const createRequestResult = z.looseObject({
  requestId: z.string(),
  // `new-request` since 5B, `new-pickup-request` since 5F.
  materialLines: z.number().optional(),
})

/**
 * The payload shape both `new-request` and `new-pickup-request` accept —
 * shared here so the two write paths can't drift apart silently. Callers
 * compute the date fields and `notes`/`delivery`/`pickup` themselves, since
 * those differ between a date range and a single pickup date.
 */
type RequestPayloadInput = {
  job: Job
  gc: string
  toDo: string
  weAre: string
  delivery: boolean
  pickup: boolean
  tentative: boolean
  floor: string
  contact: string
  contactPhone: string
  fieldPm: string
  notes: string
  timeRange: string
  requestDate: Date
  requestDateStart: Date
  requestDateEnd: Date
  toolsSummary: string
  toolsNotes: string
  /** Phase 5, both workflows (`new-pickup-request` since 5F). Left out of the payload when empty, as an older client would. */
  materialLines?: readonly ResolvedMaterialLine[]
  summary: string
  now: Date
}

function buildRequestPayload(input: RequestPayloadInput): Record<string, unknown> {
  return {
    job: input.job.name,
    // `request.job` only ever stores the job's name — this is what lets the
    // workflow find the actual `jobs` row to stamp `lastRequest` on, the way
    // the old Bubble page workflow could just reference the Job thing it
    // already had in hand.
    jobId: input.job.id,
    // The workflows write this to `request.realGC`.
    gc: input.gc,
    todo: input.toDo,
    weAre: input.weAre,
    delivery: input.delivery,
    pickup: input.pickup,
    tentative: input.tentative,
    floor: input.floor,
    contact: input.contact,
    contactPhone: input.contactPhone,
    // `fieldPM` is the option set and `fieldPM2` the text copy. Every live row
    // written in the last two years fills the text field and leaves the option
    // set empty, so this does the same.
    fieldPm: input.fieldPm,
    notes: input.notes,
    timeRange: input.timeRange,
    requestDate: input.requestDate.toISOString(),
    requestDateStart: input.requestDateStart.toISOString(),
    requestDateEnd: input.requestDateEnd.toISOString(),
    color: requestColor(input.delivery, input.pickup),
    order: DEFAULT_REQUEST_ORDER,
    // What the Bubble UI's search box matches on: the job's long description
    // followed by a New York timestamp.
    searchable: `${input.job.description} - ${newYorkStamp(input.now)}`,
    toolsSummary: input.toolsSummary,
    toolsNotes: input.toolsNotes,
    // The lines' summary — the only materials either form has since 5G. Feeds
    // `new-request`'s legacy-row step, disabled 2026-09-25 (5B §1.4), so Bubble
    // ignores it there; `new-pickup-request` still writes its row from it.
    materials: input.materialLines?.length ? formatMaterialsSummary(input.materialLines) : "",
    ...(input.materialLines?.length ? { materialLines: toNewRequestMaterialLines(input.materialLines) } : {}),
    summary: input.summary,
  }
}

/**
 * Creates a request and its tool line via the `new-request` Bubble backend
 * workflow (`POST /wf/new-request`), rather than two direct `/obj/...`
 * writes. That workflow owns creating the `request` row, the `requestedtools`
 * row, updating `jobs.lastRequest`, and sending the WhatsApp/ClickUp/Calendar
 * notifications as one server-side unit — this only builds its payload.
 * `job` and `summary` (the WhatsApp text, from `buildSummary` in
 * `lib/notify.ts`) come from the caller, which already has the session
 * context (`requestedBy`) needed to build them.
 *
 * `materialLines` are the form's lines **after** `resolveMaterialLines` — never
 * `values.materialLines` straight from the browser, whose inventory lines carry
 * no trusted name or unit.
 */
export async function createToolRequest(
  values: RequestFormValues,
  job: Job,
  summary: string,
  materialLines: readonly ResolvedMaterialLine[] = []
): Promise<CreatedRequest> {
  const now = new Date()
  // `requestDateStart` is the delivery instant — `startDate` at
  // `DEFAULT_START_HOUR` — since ClickUp and the Calendar step both read it as
  // one point in time, not a date. `requestDateEnd` is just the day tools are
  // needed until, with no appointment of its own, so it stays at midnight —
  // except when the range is a single day, where midnight of that same day
  // lands *before* `requestDateStart` and breaks the Calendar step's "end
  // after start" requirement. Same fix as `createPickupToolRequest`: fall back
  // to `requestDateStart` plus 30 minutes, which stays well short of midnight
  // the next day and doesn't change the "Until" day shown anywhere
  // `requestDateEnd` is read.
  const start = newYorkInstant(values.startDate, DEFAULT_START_HOUR)
  const end =
    values.startDate === values.endDate
      ? new Date(start.getTime() + 30 * 60 * 1000)
      : newYorkInstant(values.endDate)
  // Kept as plain midnight on the delivery day, matching every prior row —
  // unlike `requestDateStart`, `requestDate` never carried a time of day.
  const startOfDay = newYorkInstant(values.startDate)

  const raw = await bubbleRunWorkflow(
    NEW_REQUEST_WORKFLOW,
    buildRequestPayload({
      job,
      gc: values.gc,
      toDo: values.toDo,
      weAre: values.weAre,
      delivery: values.delivery,
      pickup: values.pickup,
      tentative: values.tentative,
      floor: values.floor,
      contact: values.contact,
      contactPhone: values.contactPhone,
      fieldPm: values.fieldPm,
      notes: values.notes,
      timeRange: values.timeRange,
      requestDate: startOfDay,
      requestDateStart: start,
      requestDateEnd: end,
      toolsSummary: formatToolsSummary(values.tools),
      toolsNotes: values.toolsNotes,
      materialLines,
      summary,
      now,
    })
  )

  const result = createRequestResult.parse(raw)
  return { requestId: result.requestId, job: job.name, materialLines: result.materialLines ?? 0 }
}

/**
 * The Pickup counterpart to `createToolRequest`. A pickup is a single visit,
 * so `requestDateEnd` is `requestDateStart` plus 30 minutes — **not**
 * midnight of the same day, which would land *before* `requestDateStart`
 * (start-of-day plus `DEFAULT_START_HOUR`) and broke the Calendar step's "end
 * after start" requirement in practice.
 * `cleanup` has no Bubble field of its own — folded into `notes` as a line of
 * free text instead, since adding a field isn't an option here (see
 * `CLAUDE.md`).
 *
 * `materialLines` are the form's lines after `resolveMaterialLines`, as for
 * `createToolRequest`. Their quantities are the PM's estimate.
 */
export async function createPickupToolRequest(
  values: PickupRequestFormValues,
  job: Job,
  summary: string,
  materialLines: readonly ResolvedMaterialLine[] = []
): Promise<CreatedRequest> {
  const now = new Date()
  const start = newYorkInstant(values.date, DEFAULT_START_HOUR)
  const startOfDay = newYorkInstant(values.date)
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  const notes = values.cleanup
    ? [values.notes, "Cleanup the Site requested."].filter(Boolean).join("\n")
    : values.notes

  const raw = await bubbleRunWorkflow(NEW_PICKUP_REQUEST_WORKFLOW, {
    ...buildRequestPayload({
      job,
      gc: values.gc,
      toDo: values.toDo,
      weAre: values.weAre,
      delivery: false,
      pickup: true,
      tentative: values.tentative,
      floor: values.floor,
      contact: values.contact,
      contactPhone: values.contactPhone,
      fieldPm: values.fieldPm,
      notes,
      timeRange: values.timeRange,
      requestDate: startOfDay,
      requestDateStart: start,
      requestDateEnd: end,
      toolsSummary: formatToolsSummary(values.tools),
      toolsNotes: values.toolsNotes,
      materialLines,
      summary,
      now,
    }),
    // Only the `tools` rows a PM actually changed the condition of — see
    // `lib/bubble/tool-status-updates.ts`. Delivery's `createToolRequest`
    // has no equivalent, since it never touches the `tools` table. The wire
    // param is still `toolStatusUpdates` — see that file's doc comment.
    toolStatusUpdates: formatToolConditionUpdates(values.toolConditionUpdates),
    // Phase 3B. **The only parameter this slice added** — a plain list of
    // texts, in keeping with everything else `new-pickup-request` takes.
    //
    // It drives two steps inside Bubble, both over
    // `Search for tools (unique id is in toolIds)`. One fans the private
    // `assign-request-tool` helper out across that search to write one
    // `assignedtools` row per tool, taking `toolType` from `This tools's name`
    // and `extra` from a literal `no` — so neither value has to be sent, and
    // neither can arrive stale from a browser that loaded its copy minutes ago.
    // The other flags the same tools `Pickup Requested`, which is what finally
    // makes that status value mean something; nothing wrote it before 3B.
    //
    // The **private** helper, not the public `create-assigned-tool`: that one
    // begins by deleting the request's existing rows, which is pointless on a
    // request created three steps earlier, and calling one public endpoint from
    // inside another workflow is a pattern this codebase avoids.
    toolIds: values.toolIds,
  })

  const result = createRequestResult.parse(raw)
  return { requestId: result.requestId, job: job.name, materialLines: result.materialLines ?? 0 }
}

// Phase 2B/2C's shared workflow — see `docs/bubble-request-status-workflow.md`
// §6. Built in Bubble; every tool-status write in this file goes through it —
// `dispatchRequests` was its first caller, `markToolsAssigned` /
// `releaseToolsToAvailable` below are its assign-time ones.
const UPDATE_REQUEST_STATUS_WORKFLOW = "update-request-status"

/** `{ ok, requests, tools }` — only the two counts are acted on. */
const updateStatusResult = z.looseObject({ requests: z.number(), tools: z.number() })

/**
 * The Assign step's tool-status half, called right after `assignTools`
 * (`create-assigned-tool`) commits the `assignedtools` rows: flips every
 * newly-committed tool to `Assigned`. This is what makes
 * `statusNew === "Available"` a real double-booking guard — see the reversal
 * note on `TOOL_STATUS_NEW` in `lib/bubble/enums.ts`.
 *
 * `toolLocation`/`toolUser` are deliberately not sent, same reasoning as
 * `leaveToolsBehind` below — a newly-assigned tool hasn't moved, so its
 * `location`/`currentUser` stay exactly what they were.
 *
 * `status` used to be hard-coded `Assigned`, on the reasoning that
 * `create-assigned-tool` had just written that value itself so step 1 was a
 * no-op. That stopped being true once assigning stayed open after dispatch: a
 * request that went out short and later has its missing tool filled in is
 * `In Transit` or `Partially Delivered`, and `create-assigned-tool` sets
 * `Assigned` unconditionally (`docs/bubble-request-status-workflow.md` §5 step
 * 3). So the caller passes the status the request should end up at and this
 * call is what puts it back — step 1 is a genuine write now, not a no-op.
 * `toolIds` may be empty, in which case it is *only* that status write.
 */
export async function markToolsAssigned(
  requestId: string,
  toolIds: string[],
  status: RequestStatus = "Assigned"
): Promise<{ toolsUpdated: number }> {
  const raw = await bubbleRunWorkflow(UPDATE_REQUEST_STATUS_WORKFLOW, {
    requestIds: [requestId],
    status,
    toolIds,
    toolStatus: TOOL_STATUS_ASSIGNED,
  })
  const result = updateStatusResult.parse(raw)

  if (result.requests !== 1) {
    throw new Error("Bubble did not accept the assignment. Reload and try again.")
  }

  return { toolsUpdated: result.tools }
}

/**
 * The reverse: a tool dropped from this request's assignment — always one that
 * never left, since `isLockedToTrip` refuses the rest — goes back to
 * `Available`, freeing it for any other request's picker. This is currently the
 * **only** writer of `Available` anywhere in this app — see the "no general
 * reset path yet" limit in `docs/phase-2-lifecycle.md`.
 *
 * `status` carries for the same reason it does on `markToolsAssigned`: this is
 * the last workflow call of a save, so whatever it sends is the status the
 * request is left holding.
 */
export async function releaseToolsToAvailable(
  requestId: string,
  toolIds: string[],
  status: RequestStatus = "Assigned"
): Promise<{ toolsUpdated: number }> {
  const raw = await bubbleRunWorkflow(UPDATE_REQUEST_STATUS_WORKFLOW, {
    requestIds: [requestId],
    status,
    toolIds,
    toolStatus: TOOL_STATUS_AVAILABLE,
  })
  const result = updateStatusResult.parse(raw)

  if (result.requests !== 1) {
    throw new Error("Bubble did not release the unassigned tools. Reload and try again.")
  }

  return { toolsUpdated: result.tools }
}

/**
 * Moves N `Assigned` requests and every tool assigned across them to
 * `In Transit` under one driver, via one call to `update-request-status` —
 * not two separate writes — so a partial move (some requests changed, some
 * not) is detected from the returned count rather than happening silently.
 *
 * `toolIds` may be empty (a request can reach `Assigned` with no tools
 * attached), in which case the workflow's tool-writing step is a no-op and
 * this honestly returns `toolsUpdated: 0` rather than skipping the check.
 *
 * `toolLocation` is set to the driver's name — `location` means "current
 * physical place or custodian," not just a job/Warehouse string, so a tool in
 * transit reads as being *with* whoever is carrying it rather than still
 * showing its pre-dispatch place. Offload overwrites this with the job's
 * `name` once the tool actually arrives.
 */
export async function dispatchRequests(
  requestIds: string[],
  driver: string,
  toolIds: string[]
): Promise<{ toolsUpdated: number }> {
  const raw = await bubbleRunWorkflow(UPDATE_REQUEST_STATUS_WORKFLOW, {
    requestIds,
    status: "In Transit" satisfies RequestStatus,
    driver,
    toolIds,
    toolStatus: TOOL_STATUS_IN_TRANSIT,
    toolLocation: driver,
    toolUser: driver,
  })
  const result = updateStatusResult.parse(raw)

  if (result.requests !== requestIds.length) {
    throw new Error(
      `Bubble moved ${result.requests} of ${requestIds.length} requests. Reload the board and try again.`
    )
  }

  return { toolsUpdated: result.tools }
}

/**
 * The other half of a pickup stop: the driver got there and **couldn't** take
 * the tool. It stays where it is, flagged `Pickup Requested` — still on site,
 * still wanted — and stops blocking this request's own delivery.
 *
 * `toolLocation` and `toolUser` are deliberately **not sent**. Step 3 of
 * `update-request-status` guards each with *only when not empty*
 * (`docs/bubble-update-request-status-spec.md`), so omitting them leaves the
 * tool's `location` at its own job site and its `currentUser` alone — which is
 * what keeps it findable by `listToolsForJob` afterwards. Writing `statusNew`
 * and nothing else is the entire point of this call.
 *
 * `status` is required by the workflow and is sent unchanged: the request is
 * already `In Transit`, so step 1 is a no-op, the same trick `confirmPickupAction`
 * relies on.
 */
export async function leaveToolsBehind(requestId: string, toolIds: string[]): Promise<{ toolsUpdated: number }> {
  const raw = await bubbleRunWorkflow(UPDATE_REQUEST_STATUS_WORKFLOW, {
    requestIds: [requestId],
    status: "In Transit" satisfies RequestStatus,
    toolIds,
    toolStatus: TOOL_STATUS_PICKUP_REQUESTED,
  })
  const result = updateStatusResult.parse(raw)

  if (result.requests !== 1) {
    throw new Error("Bubble did not accept the left-behind tools. Reload and try again.")
  }

  return { toolsUpdated: result.tools }
}

/**
 * Drops one request's load: moves the request and every assigned tool to
 * `Delivered`, and writes `location` to the job's name.
 *
 * `jobName` is `request.job` itself — already the exact string
 * `listToolsForJob` matches against, so this never reads the `jobs` table.
 * `driver`/`toolUser` are not sent: the request's `driver` stays whoever
 * dispatched it, and so does `currentUser` on every tool — a record of who
 * moved it, per `docs/phase-2bc-dispatch-offload.md`.
 */
export async function offloadRequest(
  requestId: string,
  toolIds: string[],
  jobName: string
): Promise<{ toolsUpdated: number }> {
  const raw = await bubbleRunWorkflow(UPDATE_REQUEST_STATUS_WORKFLOW, {
    requestIds: [requestId],
    status: "Delivered" satisfies RequestStatus,
    toolIds,
    toolStatus: TOOL_STATUS_DELIVERED,
    toolLocation: jobName,
  })
  const result = updateStatusResult.parse(raw)

  if (result.requests !== 1) {
    throw new Error("Bubble did not move this request to Delivered. Reload and try again.")
  }

  return { toolsUpdated: result.tools }
}
