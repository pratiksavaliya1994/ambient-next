import "server-only"

import { z } from "zod"

import { bubbleGet, bubbleListMaybeMissing, type BubbleThing, type Constraint } from "@/lib/bubble/client"
import { listToolTripRows, toItem, TRIP_TOOL, tripToolRow } from "@/lib/bubble/triptool-read"
import type { Trip, TripDetail, TripStop, TripToolRow } from "@/lib/bubble/trips-types"
import {
  DEFAULT_TRIP_STATUS,
  isLiveClaim,
  isOpenTrip,
  STOP_KIND,
  TRIP_STATUS,
  type TripStatus,
} from "@/lib/trips/plan-types"

/**
 * Reading `trip`, `tripstop` and `triptool`.
 *
 * Split from the writes in `lib/bubble/trips.ts` so neither file approaches the
 * 300-line cap, and because the read side has one job the write side does not:
 * **the claim query**, which is what stops the same physical tool being put on
 * two trips at once.
 *
 * All three types are joined on text ids, not Bubble links, so every join here
 * is a `{key, "in", [...]}` query plus a JS merge — the shape `withLines`
 * already proves in `requests.ts`.
 *
 * `status` is read through `z.enum`, deliberately: it is text in Bubble
 * precisely so that an unexpected value fails loudly here rather than silently
 * on a write. A row Bubble wrote by hand with a typo should break the screen,
 * not be quietly treated as `Planned`.
 *
 * The `triptool` row schema and the reads keyed by *tool* rather than by trip
 * live in `triptool-read.ts`; this file imports them.
 */

const TRIP = "trip"
const TRIP_STOP = "tripstop"

const tripRow = z.looseObject({
  _id: z.string(),
  "Created Date": z.string().optional(),
  driver: z.string().optional(),
  tripDate: z.string().optional(),
  status: z.enum(TRIP_STATUS).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  notes: z.string().optional(),
})

const tripStopRow = z.looseObject({
  _id: z.string(),
  tripID: z.string().optional(),
  stopKey: z.string().optional(),
  // Bubble hands `seq` back as text even though the builder writes a number,
  // so it is coerced rather than matched. `z.coerce.number()` still rejects
  // NaN, so a hand-edited non-numeric row fails as loudly as a bad enum does.
  seq: z.coerce.number().optional(),
  location: z.string().optional(),
  kind: z.enum(STOP_KIND).optional(),
})

function toTrip(row: z.infer<typeof tripRow>): Trip {
  return {
    id: row._id,
    driver: row.driver?.trim() || null,
    tripDate: row.tripDate ?? null,
    status: row.status ?? DEFAULT_TRIP_STATUS,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    notes: row.notes?.trim() || null,
    createdAt: row["Created Date"] ?? null,
  }
}

function toStop(row: z.infer<typeof tripStopRow>): TripStop | null {
  if (!row.tripID || !row.stopKey) return null
  return {
    id: row._id,
    tripId: row.tripID,
    stopKey: row.stopKey,
    // A stop with no `seq` sorts to the front rather than crashing; the builder
    // always writes one, so this only covers a hand-edited row.
    seq: row.seq ?? 0,
    location: row.location ?? "",
    kind: row.kind ?? "Job",
  }
}

/** Trip headers at any of these statuses, newest first. */
export async function listTrips(statuses: readonly TripStatus[]): Promise<Trip[]> {
  if (statuses.length === 0) return []

  const rows = await bubbleListMaybeMissing(TRIP, {
    constraints: [{ key: "status", constraint_type: "in", value: [...statuses] }],
    sortField: "Created Date",
    descending: true,
  })

  return rows
    .map((row: BubbleThing) => toTrip(tripRow.parse(row)))
    // Re-filtered in JS: `in` is only proven against plain text elsewhere in
    // this repo, and a constraint Bubble misreads would otherwise hand back
    // every trip ever run.
    .filter((trip) => statuses.includes(trip.status))
}

/** Every trip's stops and items in two queries, not two per trip. */
export async function attachTripRows(trips: Trip[]): Promise<TripDetail[]> {
  if (trips.length === 0) return []

  const tripIds = trips.map((trip) => trip.id)
  const [stopRows, itemRows] = await Promise.all([
    bubbleListMaybeMissing(TRIP_STOP, {
      constraints: [{ key: "tripID", constraint_type: "in", value: tripIds }],
    }),
    bubbleListMaybeMissing(TRIP_TOOL, {
      constraints: [{ key: "tripID", constraint_type: "in", value: tripIds }],
    }),
  ])

  const stopsByTrip = new Map<string, TripStop[]>()
  for (const raw of stopRows) {
    const stop = toStop(tripStopRow.parse(raw))
    if (!stop) continue
    stopsByTrip.set(stop.tripId, [...(stopsByTrip.get(stop.tripId) ?? []), stop])
  }

  const itemsByTrip = new Map<string, TripToolRow[]>()
  for (const raw of itemRows) {
    const item = toItem(tripToolRow.parse(raw))
    if (!item) continue
    itemsByTrip.set(item.tripId, [...(itemsByTrip.get(item.tripId) ?? []), item])
  }

  return trips.map((trip) => ({
    ...trip,
    stops: (stopsByTrip.get(trip.id) ?? []).sort((a, b) => a.seq - b.seq || a.stopKey.localeCompare(b.stopKey)),
    items: (itemsByTrip.get(trip.id) ?? []).sort((a, b) => a.toolName.localeCompare(b.toolName)),
  }))
}

export async function listTripDetails(statuses: readonly TripStatus[]): Promise<TripDetail[]> {
  return attachTripRows(await listTrips(statuses))
}

export async function getTrip(tripId: string): Promise<TripDetail | null> {
  const row = await bubbleGet(TRIP, tripId)
  if (!row) return null

  const [detail] = await attachTripRows([toTrip(tripRow.parse(row))])
  return detail ?? null
}

/**
 * Which of these tools are already spoken for by an open trip — the check that
 * keeps one physical tool off two trips at once.
 *
 * Bubble cannot join, so this is two reads filtered in JS: the `triptool` rows
 * still holding a claim (`Planned` or `Loaded`), then the trips those belong
 * to, keeping only the ones still open (`Planned` or `In Transit`). A
 * `Dropped` item, or an item on a `Completed`/`Cancelled` trip, releases its
 * tool — which is exactly what lets a tool delivered to Job X be collected
 * from Job X by a later trip.
 *
 * Run **twice**: once when building the movement pool, and again inside
 * `startTripAction` immediately before the write. That narrows the window to
 * about a second. It does not close it — Bubble has no transactions and no
 * unique constraints — which is the same posture every other write here takes.
 *
 * Returns a map so a caller can say *which* trip has the tool, not just that
 * something does.
 *
 * `excludeTripId` drops the claims one trip holds. The edit builder needs this:
 * a draft's own tools are claimed *by that draft*, so without it every tool on
 * the trip being edited reads as blocked, the selection plans no movements, and
 * the route panel comes up empty.
 */
export async function listToolClaims(
  toolIds: readonly string[],
  excludeTripId?: string
): Promise<Map<string, Trip>> {
  const claims = (await listToolTripRows(toolIds)).filter(
    (item) => item.tripId !== excludeTripId && isLiveClaim(item.state)
  )

  if (claims.length === 0) return new Map()

  const tripIds = [...new Set(claims.map((item) => item.tripId))]
  const tripRows = await bubbleListMaybeMissing(TRIP, {
    constraints: [{ key: "_id", constraint_type: "in", value: tripIds }],
  })

  const openTrips = new Map(
    tripRows
      .map((raw) => toTrip(tripRow.parse(raw)))
      .filter((trip) => isOpenTrip(trip.status))
      .map((trip) => [trip.id, trip])
  )

  const byTool = new Map<string, Trip>()
  for (const item of claims) {
    const trip = openTrips.get(item.tripId)
    if (trip) byTool.set(item.toolId, trip)
  }
  return byTool
}

/**
 * Just the keys a trip's plan currently holds in Bubble — which stops exist and
 * which tools are on them.
 *
 * `create-trip` and `save-trip` build their rows with *Schedule API Workflow on
 * a list*: the call returns once the runs are **queued**, not once they have
 * run. For a second or two afterwards Bubble genuinely holds a partial plan,
 * and a page rendered inside that window shows stops with nothing happening at
 * them and tools pointing at stops that do not exist yet. `save-trip` is worse
 * than `create-trip` because it deletes first — the old plan is gone before the
 * new one has finished arriving.
 *
 * Deliberately cheaper than `getTrip`: no header read, no row parsing beyond
 * the one key each side is identified by, because this gets polled. See
 * `waitForTripPlan`.
 */
export async function readTripPlanKeys(tripId: string): Promise<{ stopKeys: Set<string>; toolIds: Set<string> }> {
  const constraints: Constraint[] = [{ key: "tripID", constraint_type: "equals", value: tripId }]
  const [stopRows, itemRows] = await Promise.all([
    bubbleListMaybeMissing(TRIP_STOP, { constraints }),
    bubbleListMaybeMissing(TRIP_TOOL, { constraints }),
  ])

  // Re-filtered on `tripID` in JS for the same reason `listTrips` re-filters its
  // statuses: a constraint Bubble misreads would otherwise answer this question
  // with another trip's rows.
  const stopKeys = new Set(
    stopRows
      .map((raw) => toStop(tripStopRow.parse(raw)))
      .filter((stop): stop is TripStop => stop !== null && stop.tripId === tripId)
      .map((stop) => stop.stopKey)
  )
  const toolIds = new Set(
    itemRows
      .map((raw) => toItem(tripToolRow.parse(raw)))
      .filter((item): item is TripToolRow => item !== null && item.tripId === tripId)
      .map((item) => item.toolId)
  )

  return { stopKeys, toolIds }
}
