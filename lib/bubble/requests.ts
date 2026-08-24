import "server-only"

import { z } from "zod"

import {
  bubbleCreate,
  bubbleList,
  bubbleListAll,
  type BubbleThing,
} from "@/lib/bubble/client"
import { newYorkInstant, newYorkStamp } from "@/lib/bubble/dates"
import { DEFAULT_REQUEST_ORDER, requestColor } from "@/lib/bubble/enums"
import { listJobs } from "@/lib/bubble/reference"
import {
  formatToolsSummary,
  parseToolsSummary,
  type ToolLine,
} from "@/lib/bubble/tools-summary"
import type { RequestFormValues } from "@/lib/schemas/request"

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

const SLOT_LENGTH_MS = 60 * 60 * 1000

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
  start: string | null
  end: string | null
  tools: ToolLine[]
  toolsNotes: string | null
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
    request.tools.length > 0
  )
}

function toToolRequest(
  row: z.infer<typeof requestRow>,
  lines: ToolLine[],
  toolsNotes: string | null
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
  const toolRows = await bubbleListAll(REQUESTED_TOOLS, {
    constraints: [{ key: "requestID", constraint_type: "in", value: ids }],
  })

  const byRequest = new Map<
    string,
    { lines: Map<string, number>; notes: string[] }
  >()
  for (const raw of toolRows) {
    const row = requestedToolsRow.parse(raw)
    if (!row.requestID) continue

    const bucket = byRequest.get(row.requestID) ?? {
      lines: new Map<string, number>(),
      notes: [],
    }
    for (const line of parseToolsSummary(row.toolsSummary)) {
      bucket.lines.set(
        line.name,
        (bucket.lines.get(line.name) ?? 0) + line.quantity
      )
    }
    if (row.toolsNotes?.trim()) bucket.notes.push(row.toolsNotes.trim())
    byRequest.set(row.requestID, bucket)
  }

  return rows.map((row) => {
    const bucket = byRequest.get(row._id)
    const lines = [...(bucket?.lines ?? [])]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return toToolRequest(row, lines, bucket?.notes.join("\n\n") || null)
  })
}

export type CreatedRequest = {
  requestId: string
  /** The `requestedtools` row, or null if the request landed and it did not. */
  toolsRowId: string | null
  job: string
  summary: string
}

/**
 * Creates a request and its tool line.
 *
 * There are no transactions in the Data API. The `request` row is written
 * first because it is the row the ids hang off; if the `requestedtools` write
 * then fails the request still exists, so `toolsRowId` comes back null and the
 * caller must say so rather than reporting a clean success.
 */
export async function createToolRequest(
  values: RequestFormValues
): Promise<CreatedRequest> {
  const job = (await listJobs()).find(
    (candidate) => candidate.id === values.jobId
  )
  if (!job) throw new Error("That job no longer exists in Bubble.")

  const now = new Date()
  const start = newYorkInstant(values.day, values.slotHour)
  const end = new Date(start.getTime() + SLOT_LENGTH_MS)

  const requestId = await bubbleCreate(REQUEST, {
    job: job.name,
    toDo: values.toDo,
    weAre: values.weAre,
    delivery: values.delivery,
    pickup: values.pickup,
    tentative: values.tentative,
    completed: false,
    floor: values.floor,
    contact: values.contact,
    contactPhone: values.contactPhone,
    // `fieldPM` is the option set and `fieldPM2` the text copy. Every live row
    // written in the last two years fills the text field and leaves the option
    // set empty, so this does the same.
    fieldPM2: values.fieldPm,
    notes: values.notes,
    timeRange: values.timeRange,
    // Midnight New York on the delivery day, matching every live row.
    requestDate: newYorkInstant(values.day).toISOString(),
    requestDateStart: start.toISOString(),
    requestDateEnd: end.toISOString(),
    color: requestColor(values.delivery, values.pickup),
    order: DEFAULT_REQUEST_ORDER,
    // What the Bubble UI's search box matches on: the job's long description
    // followed by a New York timestamp.
    searchable: `${job.description} - ${newYorkStamp(now)}`,
  })

  const summary = formatToolsSummary(values.tools)

  let toolsRowId: string | null = null
  try {
    toolsRowId = await bubbleCreate(REQUESTED_TOOLS, {
      requestID: requestId,
      toolsSummary: summary,
      toolsNotes: values.toolsNotes,
    })
  } catch {
    // Swallowed on purpose: the request exists and the caller needs its id to
    // tell the user what did and did not land.
  }

  return { requestId, toolsRowId, job: job.name, summary }
}
