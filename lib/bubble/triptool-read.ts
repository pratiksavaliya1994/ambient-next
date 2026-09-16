import "server-only"

import { z } from "zod"

import { bubbleListMaybeMissing, type BubbleThing } from "@/lib/bubble/client"
import type { TripToolRow } from "@/lib/bubble/trips-types"
import { DEFAULT_TRIP_TOOL_STATE, TRIP_TOOL_STATE, tripFlagOf, type TripFlag } from "@/lib/trips/plan-types"

/**
 * Reading `triptool` — the row schema every trip read parses through, plus the
 * two questions answered by looking a *tool* up rather than a trip: **who is
 * holding it** (`listToolClaims`, over in `trips-read.ts`) and **what did the
 * last trip decide about it** (`listTripFlags`, here).
 *
 * Split out of `trips-read.ts` in the same pass that added the skip lookup:
 * that file was at 289 lines, and the schema plus `toItem` are exactly the part
 * both sides share.
 *
 * `state` is read through `z.enum` deliberately — it is text in Bubble, so an
 * unexpected value should break the screen rather than be quietly treated as
 * `Planned`. Same reasoning `trips-read.ts` gives for `trip.status`.
 */

export const TRIP_TOOL = "triptool"

export const tripToolRow = z.looseObject({
  _id: z.string(),
  "Created Date": z.string().optional(),
  tripID: z.string().optional(),
  toolID: z.string().optional(),
  requestID: z.string().optional(),
  toolName: z.string().optional(),
  toolType: z.string().optional(),
  fromStopKey: z.string().optional(),
  fromLocation: z.string().optional(),
  toStopKey: z.string().optional(),
  toLocation: z.string().optional(),
  state: z.enum(TRIP_TOOL_STATE).optional(),
})

export function toItem(row: z.infer<typeof tripToolRow>): TripToolRow | null {
  if (!row.tripID || !row.toolID) return null
  return {
    id: row._id,
    tripId: row.tripID,
    toolId: row.toolID,
    requestId: row.requestID ?? "",
    toolName: row.toolName ?? "",
    toolType: row.toolType ?? "",
    fromStopKey: row.fromStopKey ?? "",
    fromLocation: row.fromLocation ?? "",
    toStopKey: row.toStopKey ?? "",
    toLocation: row.toLocation ?? "",
    state: row.state ?? DEFAULT_TRIP_TOOL_STATE,
    createdAt: row["Created Date"] ?? null,
  }
}

/** Every `triptool` row naming one of these tools, oldest first. One `in` query. */
export async function listToolTripRows(toolIds: readonly string[]): Promise<TripToolRow[]> {
  if (toolIds.length === 0) return []

  const rows = await bubbleListMaybeMissing(TRIP_TOOL, {
    constraints: [{ key: "toolID", constraint_type: "in", value: [...toolIds] }],
  })

  const wanted = new Set(toolIds)
  return rows
    .map((raw: BubbleThing) => toItem(tripToolRow.parse(raw)))
    .filter((item): item is TripToolRow => item !== null && wanted.has(item.toolId))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
}

/**
 * What the last trip to touch each tool **decided** about it —
 * `requestId` → `toolId` → `TripFlag`. Only tools with something to say appear.
 *
 * This is the ground truth behind the amber "Not picked up" and "Refused" rows,
 * and it replaced a guess. The old test was
 * `statusNew === "Pickup Requested" && !isWarehouseLocation(location)`, which
 * got a skip wrong twice over. A tool skipped at a **warehouse** stop keeps
 * `location = "Warehouse"` — the skip step writes `statusNew` and nothing else
 * — so it never matched at all: it fell through to `not-ready` and told the PM
 * their own tool was "out on another request", sitting in their own yard. And
 * `Pickup Requested` on a job site is genuinely ambiguous, because it equally
 * means *some pickup request wants this collected*, which is a real blocker. A
 * `triptool` row cannot be ambiguous about either.
 *
 * A **refusal is invisible in `tools` altogether**, which is why it has to be
 * read here or not at all: the drop simply never happened, so the row comes
 * home reading `Available` at `"Warehouse"` — indistinguishable from a tool
 * that has been sitting in the yard all week. `tripFlagOf` is what separates
 * them, and it is the same newest-row-wins read either way.
 *
 * **Keyed by request as well as tool**, because the two genuinely cross: a
 * skipped tool stays `Pickup Requested` and a returned one goes back to
 * `Available`, both of which `isFreeToAssign` counts as free, so the same tool
 * can be assigned to a second request while the first still records what
 * happened. Only the request that was on that trip should show it.
 *
 * **Newest row wins.** Neither flag is permanent — the usual next move is
 * putting the tool on another trip, and once that row exists (`Planned`, then
 * `Loaded`, then `Dropped`) there is nothing left to flag. Reading only the
 * latest row per request-and-tool is what lets both clear themselves.
 */
export async function listTripFlags(toolIds: readonly string[]): Promise<Map<string, Map<string, TripFlag>>> {
  const latest = new Map<string, TripToolRow>()
  // Oldest first out of `listToolTripRows`, so the last write per key is newest.
  for (const item of await listToolTripRows(toolIds)) {
    if (!item.requestId) continue
    latest.set(`${item.requestId}/${item.toolId}`, item)
  }

  const byRequest = new Map<string, Map<string, TripFlag>>()
  for (const item of latest.values()) {
    const flag = tripFlagOf(item.state)
    if (!flag) continue
    const tools = byRequest.get(item.requestId) ?? new Map<string, TripFlag>()
    tools.set(item.toolId, flag)
    byRequest.set(item.requestId, tools)
  }
  return byRequest
}
