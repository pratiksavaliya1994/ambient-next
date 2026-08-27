import "server-only"

import { z } from "zod"

import { bubbleList, bubbleListAll, bubbleRunWorkflow, type BubbleThing } from "@/lib/bubble/client"
import { newYorkInstant, newYorkStamp } from "@/lib/bubble/dates"
import { DEFAULT_REQUEST_ORDER, requestColor } from "@/lib/bubble/enums"
import type { Job } from "@/lib/bubble/reference-types"
import { formatToolStatusUpdates } from "@/lib/bubble/tool-status-updates"
import { formatToolsSummary, parseToolsSummary, type ToolLine } from "@/lib/bubble/tools-summary"
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

const REQUEST = "request"
const REQUESTED_TOOLS = "requestedtools"
const REQUESTED_MATERIALS = "requestedmaterials"

const requestRow = z.looseObject({
  _id: z.string(),
  "Created Date": z.string().optional(),
  job: z.string().optional(),
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
})

const requestedToolsRow = z.looseObject({
  _id: z.string(),
  requestID: z.string().optional(),
  toolsSummary: z.string().optional(),
  toolsNotes: z.string().optional(),
})

const requestedMaterialsRow = z.looseObject({
  _id: z.string(),
  requestID: z.string().optional(),
  materials: z.string().optional(),
})

/** `materials` is one line per item, free text — no `Name: qty` structure to lean on. */
function parseMaterialsList(text: string | undefined): string[] {
  if (!text) return []
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export type ToolRequest = {
  id: string
  createdAt: string | null
  job: string
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
  /** Lines from the request's `requestedmaterials` row(s), free text. */
  materials: string[]
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
    request.materials.length > 0
  )
}

function toToolRequest(
  row: z.infer<typeof requestRow>,
  lines: ToolLine[],
  toolsNotes: string | null,
  materials: string[]
): ToolRequest {
  return {
    id: row._id,
    createdAt: row["Created Date"] ?? null,
    job: row.job ?? NO_JOB,
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
    materials,
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

  const rows = page.results.map((row: BubbleThing) => requestRow.parse(row))
  const ids = rows.map((row) => row._id)
  if (ids.length === 0) return []

  // Paged through rather than capped at one page: several `requestedtools`
  // rows per request means a single 100-row page runs out before the last
  // request does, which showed up as cards claiming "No tools listed".
  const [toolRows, materialRows] = await Promise.all([
    bubbleListAll(REQUESTED_TOOLS, {
      constraints: [{ key: "requestID", constraint_type: "in", value: ids }],
    }),
    bubbleListAll(REQUESTED_MATERIALS, {
      constraints: [{ key: "requestID", constraint_type: "in", value: ids }],
    }),
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

  const materialsByRequest = new Map<string, string[]>()
  for (const raw of materialRows) {
    const row = requestedMaterialsRow.parse(raw)
    if (!row.requestID) continue

    const lines = materialsByRequest.get(row.requestID) ?? []
    lines.push(...parseMaterialsList(row.materials))
    materialsByRequest.set(row.requestID, lines)
  }

  return rows.map((row) => {
    const bucket = byRequest.get(row._id)
    const lines = [...(bucket?.lines ?? [])]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return toToolRequest(row, lines, bucket?.notes.join("\n\n") || null, materialsByRequest.get(row._id) ?? [])
  })
}

export type CreatedRequest = {
  requestId: string
  job: string
}

// Named `create-request` during the original spec; renamed to `new-request`
// partway through the Bubble Studio build. Every call goes through this one
// constant so that drift can't happen again.
const NEW_REQUEST_WORKFLOW = "new-request"

// A separate Bubble Studio workflow, mirroring `new-request`'s steps for the
// Pickup flow (built there, not in this repo) — see
// `bubble-new-request-workflow-summary.md` for the steps to mirror.
const NEW_PICKUP_REQUEST_WORKFLOW = "new-pickup-request"

const createRequestResult = z.object({
  requestId: z.string(),
})

/**
 * The payload shape both `new-request` and `new-pickup-request` accept —
 * shared here so the two write paths can't drift apart silently. Callers
 * compute the date fields and `notes`/`delivery`/`pickup` themselves, since
 * those differ between a date range and a single pickup date.
 */
type RequestPayloadInput = {
  job: Job
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
  materials: string
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
    // Forward-compatible: the workflow doesn't act on this yet — it's meant to
    // create a `requestedmaterials` row (`materials` + `toDo` as `jobType`)
    // when this is non-empty, once that step is added on the Bubble side. The
    // WhatsApp line for it is already live — see `buildSummary`.
    materials: input.materials,
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
 */
export async function createToolRequest(values: RequestFormValues, job: Job, summary: string): Promise<CreatedRequest> {
  const now = new Date()
  // `requestDateStart` is the actual delivery instant — `startDate` at the
  // chosen slot's hour — since ClickUp and the Calendar step both read it as
  // one point in time, not a date. `requestDateEnd` is just the day tools are
  // needed until, with no appointment of its own, so it stays at midnight.
  const start = newYorkInstant(values.startDate, values.slotHour)
  const end = newYorkInstant(values.endDate)
  // Kept as plain midnight on the delivery day, matching every prior row —
  // unlike `requestDateStart`, `requestDate` never carried a time of day.
  const startOfDay = newYorkInstant(values.startDate)

  const raw = await bubbleRunWorkflow(
    NEW_REQUEST_WORKFLOW,
    buildRequestPayload({
      job,
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
      materials: values.materials,
      summary,
      now,
    })
  )

  const result = createRequestResult.parse(raw)
  return { requestId: result.requestId, job: job.name }
}

/**
 * The Pickup counterpart to `createToolRequest`. A pickup is a single visit,
 * so `requestDateEnd` is the same instant as `requestDateStart` plus the
 * chosen slot's 30-minute duration — **not** midnight of the same day, which
 * would land *before* `requestDateStart` (start-of-day plus the slot hour)
 * and broke the Calendar step's "end after start" requirement in practice.
 * `cleanup` has no Bubble field of its own — folded into `notes` as a line of
 * free text instead, since adding a field isn't an option here (see
 * `CLAUDE.md`).
 */
export async function createPickupToolRequest(
  values: PickupRequestFormValues,
  job: Job,
  summary: string
): Promise<CreatedRequest> {
  const now = new Date()
  const start = newYorkInstant(values.date, values.slotHour)
  const startOfDay = newYorkInstant(values.date)
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  const notes = values.cleanup
    ? [values.notes, "Cleanup the Site requested."].filter(Boolean).join("\n")
    : values.notes

  const raw = await bubbleRunWorkflow(NEW_PICKUP_REQUEST_WORKFLOW, {
    ...buildRequestPayload({
      job,
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
      materials: values.materials,
      summary,
      now,
    }),
    // Only the `tools` rows a PM actually changed the status of — see
    // `lib/bubble/tool-status-updates.ts`. Delivery's `createToolRequest`
    // has no equivalent, since it never touches the `tools` table.
    toolStatusUpdates: formatToolStatusUpdates(values.toolStatusUpdates),
  })

  const result = createRequestResult.parse(raw)
  return { requestId: result.requestId, job: job.name }
}
