import "server-only"

import { z } from "zod"

import { bubbleListMaybeMissing, type BubbleThing, type Constraint } from "@/lib/bubble/client"
import { MATERIAL_KIND } from "@/lib/bubble/requested-materials-types"
import type { LineTripRow, TripMaterialRow } from "@/lib/bubble/trip-materials-types"
import {
  DEFAULT_TRIP_TOOL_STATE,
  TRIP_STATUS,
  TRIP_TOOL_STATE,
  tripFlagOf,
  type TripFlag,
  type TripStatus,
} from "@/lib/trips/plan-types"

/**
 * Reading `tripmaterial` — the material twin of `triptool-read.ts`.
 *
 * Two ways in, as for tools: **by trip** (`listTripMaterials`, what the run
 * sheet and `attachTripRows` use) and **by line** (`listTripMaterialsForLines`,
 * what the pool, the assign floor, Close request and `request.status` ask).
 *
 * `state` goes through `z.enum` for the reason `triptool-read.ts` gives: text
 * in Bubble, so an unexpected value should break the screen rather than read as
 * `Planned`.
 *
 * Doesn't import `trips-read.ts`, which imports this file; the by-line read
 * checks trip statuses with its own two-field parse instead.
 */

export const TRIP_MATERIAL = "tripmaterial"
const TRIP = "trip"

export const tripMaterialRow = z.looseObject({
  _id: z.string(),
  "Created Date": z.string().optional(),
  tripID: z.string().optional(),
  requestID: z.string().optional(),
  lineID: z.string().optional(),
  materialID: z.string().optional(),
  name: z.string().optional(),
  unit: z.string().optional(),
  kind: z.enum(MATERIAL_KIND).optional(),
  qty: z.number().optional(),
  actualQty: z.number().optional(),
  fromStopKey: z.string().optional(),
  fromLocation: z.string().optional(),
  toStopKey: z.string().optional(),
  toLocation: z.string().optional(),
  state: z.enum(TRIP_TOOL_STATE).optional(),
})

export function toMaterialRow(row: z.infer<typeof tripMaterialRow>): TripMaterialRow | null {
  if (!row.tripID || !row.lineID) return null
  return {
    id: row._id,
    tripId: row.tripID,
    requestId: row.requestID ?? "",
    lineId: row.lineID,
    materialId: row.materialID || null,
    name: row.name ?? "",
    unit: row.unit ?? "",
    kind: row.kind ?? null,
    qty: row.qty ?? 0,
    actualQty: row.actualQty ?? null,
    fromStopKey: row.fromStopKey ?? "",
    fromLocation: row.fromLocation ?? "",
    toStopKey: row.toStopKey ?? "",
    toLocation: row.toLocation ?? "",
    state: row.state ?? DEFAULT_TRIP_TOOL_STATE,
    createdAt: row["Created Date"] ?? null,
  }
}

/** Parses rows and keeps those `keep` accepts — re-filtered in JS, as every `in` read here is. */
async function readRows(
  constraints: Constraint[],
  keep: (row: TripMaterialRow) => boolean
): Promise<TripMaterialRow[]> {
  const rows = await bubbleListMaybeMissing(TRIP_MATERIAL, { constraints })
  return rows
    .map((raw: BubbleThing) => toMaterialRow(tripMaterialRow.parse(raw)))
    .filter((row): row is TripMaterialRow => row !== null && keep(row))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
}

/** Every `tripmaterial` row on these trips, oldest first. One `in` query. */
export async function listTripMaterials(tripIds: readonly string[]): Promise<TripMaterialRow[]> {
  if (tripIds.length === 0) return []
  const wanted = new Set(tripIds)
  return readRows([{ key: "tripID", constraint_type: "in", value: [...wanted] }], (row) => wanted.has(row.tripId))
}

const tripStatusRow = z.looseObject({ _id: z.string(), status: z.enum(TRIP_STATUS).optional() })

/** `trip._id` → status, for the trips these rows sit on. A trip missing from the map no longer exists. */
async function tripStatuses(tripIds: readonly string[]): Promise<Map<string, TripStatus>> {
  if (tripIds.length === 0) return new Map()
  const rows = await bubbleListMaybeMissing(TRIP, {
    constraints: [{ key: "_id", constraint_type: "in", value: [...new Set(tripIds)] }],
  })
  return new Map(
    rows.map((raw) => {
      const row = tripStatusRow.parse(raw)
      return [row._id, row.status ?? "Planned"] as const
    })
  )
}

/**
 * Every `tripmaterial` row for these lines, oldest first, each with its
 * **trip's status** — `lineProgress` counts a `Planned` row only while its
 * trip is open. Two queries: the rows, then their trips.
 */
export async function listTripMaterialsForLines(lineIds: readonly string[]): Promise<LineTripRow[]> {
  if (lineIds.length === 0) return []
  const wanted = new Set(lineIds)
  const rows = await readRows([{ key: "lineID", constraint_type: "in", value: [...wanted] }], (row) =>
    wanted.has(row.lineId)
  )

  const statuses = await tripStatuses(rows.map((row) => row.tripId))
  return rows.map((row) => ({ ...row, tripStatus: statuses.get(row.tripId) ?? null }))
}

/**
 * What the last trip to carry each line **decided** about it — `requestId` →
 * `lineId` → `TripFlag`. `listTripFlags`' recipe: newest row wins, so putting
 * the line on another trip clears the flag. The request page reads it for
 * "Refused" and "Not loaded".
 */
export async function listLineTripFlags(lineIds: readonly string[]): Promise<Map<string, Map<string, TripFlag>>> {
  return lineTripFlags(await listTripMaterialsForLines(lineIds))
}

/**
 * `listLineTripFlags` over rows already read — for a page that also needs the
 * rows themselves (the request page's progress), so they're read once.
 * `rows` must be oldest first, as `listTripMaterialsForLines` returns them.
 */
export function lineTripFlags(rows: readonly TripMaterialRow[]): Map<string, Map<string, TripFlag>> {
  const latest = new Map<string, TripMaterialRow>()
  // Oldest first, so the last write per key is the newest.
  for (const row of rows) {
    if (!row.requestId) continue
    latest.set(`${row.requestId}/${row.lineId}`, row)
  }

  const byRequest = new Map<string, Map<string, TripFlag>>()
  for (const row of latest.values()) {
    const flag = tripFlagOf(row.state)
    if (!flag) continue
    const lines = byRequest.get(row.requestId) ?? new Map<string, TripFlag>()
    lines.set(row.lineId, flag)
    byRequest.set(row.requestId, lines)
  }
  return byRequest
}
