import "server-only"

import { z } from "zod"

import { bubbleListMaybeMissing, type BubbleThing } from "@/lib/bubble/client"
import { MATERIAL_KIND } from "@/lib/bubble/requested-materials-types"
import type { TripMaterialRow } from "@/lib/bubble/trip-materials-types"
import { DEFAULT_TRIP_TOOL_STATE, TRIP_TOOL_STATE } from "@/lib/trips/plan-types"

/**
 * Reading `tripmaterial` — the material twin of `triptool-read.ts`.
 *
 * Nothing writes these rows until 5D, so every read here returns `[]` today.
 * It exists now because the assign floor check and Close request's guard both
 * ask "what of this line is already on a trip?", and building the guard with
 * the question means 5D inherits it instead of having to remember to add it.
 *
 * `state` goes through `z.enum` for the reason `triptool-read.ts` gives: text
 * in Bubble, so an unexpected value should break the screen rather than read as
 * `Planned`.
 */

export const TRIP_MATERIAL = "tripmaterial"

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

/** Every `tripmaterial` row for these lines, oldest first. One `in` query. */
export async function listTripMaterialsForLines(lineIds: readonly string[]): Promise<TripMaterialRow[]> {
  if (lineIds.length === 0) return []

  const rows = await bubbleListMaybeMissing(TRIP_MATERIAL, {
    constraints: [{ key: "lineID", constraint_type: "in", value: [...new Set(lineIds)] }],
  })

  const wanted = new Set(lineIds)
  return rows
    .map((raw: BubbleThing) => toMaterialRow(tripMaterialRow.parse(raw)))
    .filter((row): row is TripMaterialRow => row !== null && wanted.has(row.lineId))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
}
