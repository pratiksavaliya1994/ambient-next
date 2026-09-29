/**
 * The `trip` / `tripstop` / `triptool` rows as the app reads them.
 *
 * Split from `lib/bubble/trips.ts` and `trips-read.ts` because those are
 * `server-only` and the run sheet, the trip card and the builder all need these
 * shapes in the browser. Same reason `assigned-tools-types.ts` exists.
 *
 * Every id here is **text holding another row's `_id`, not a Bubble link** —
 * the house pattern (`requestedtools.requestID`, `request.job`,
 * `tools.location`). There is no referential integrity to lean on, so every
 * join below happens in JS and every one of them tolerates a missing partner.
 */

import { DEFAULT_WAREHOUSE } from "@/lib/bubble/enums"
import {
  isCollectFinished,
  isCollectOutstanding,
  isDropFinished,
  isDropOutstanding,
  isTurnedAway,
  type TripMaterialRow,
} from "@/lib/bubble/trip-materials-types"
import { isOnTruck, type StopKind, type TripStatus, type TripToolState } from "@/lib/trips/plan-types"

export type Trip = {
  id: string
  driver: string | null
  /** ISO. The day the trip runs — not when the draft was made. */
  tripDate: string | null
  status: TripStatus
  /** When `Start trip` was pressed. `Created Date` is when the draft was made. */
  startedAt: string | null
  /** ditto, versus `Modified Date`, which any edit moves. */
  completedAt: string | null
  notes: string | null
  createdAt: string | null
}

export type TripStop = {
  id: string
  tripId: string
  /** Client-generated and stable for the life of the stop. What `triptool` joins on. */
  stopKey: string
  seq: number
  location: string
  kind: StopKind
}

export type TripToolRow = {
  id: string
  tripId: string
  toolId: string
  /** May be empty — a leg that belongs to no request. */
  requestId: string
  toolName: string
  toolType: string
  fromStopKey: string
  fromLocation: string
  toStopKey: string
  toLocation: string
  state: TripToolState
  /** When the row was planned. Orders a tool's rows across trips — see `listTripFlags`. */
  createdAt: string | null
}

/** A trip with its stops, tools and material lines attached — what every trip screen renders from. */
export type TripDetail = Trip & {
  stops: TripStop[]
  items: TripToolRow[]
  materials: TripMaterialRow[]
}

/**
 * One stop with the work at it split the two ways a driver reads it.
 *
 * This is the shape that replaces nested pickups: "collect these, drop these"
 * at one place, rather than a pickup buried under the request it serves.
 */
export type StopWork = {
  stop: TripStop
  collect: TripToolRow[]
  drop: TripToolRow[]
  /**
   * Tools this stop **turned away**, still listed here after the fact.
   *
   * Display only: the actionable row has moved to the return stop, but the
   * refusal happened *here*, and a run sheet that dropped it would show a stop
   * ticked Done with no sign that a delivery failed at it. Deliberately outside
   * both outstanding lists and outside `isStopDone`'s test — there is nothing
   * left to do about it at this address.
   */
  refused: TripToolRow[]
  /** The same three lists for material lines, split by the same rules. */
  collectMaterials: TripMaterialRow[]
  dropMaterials: TripMaterialRow[]
  refusedMaterials: TripMaterialRow[]
}

/**
 * The stop a refused tool is carried to when the route has no warehouse left on
 * it. Synthesised by `stopWork`, with **no `tripstop` row behind it**.
 *
 * It cannot collide with a real key: every real one is derived from a location
 * (`stopKeyOf` in `lib/trips/plan.ts`) and `plannedStopSchema` requires those to
 * be non-empty.
 */
export const RETURN_STOP_KEY = "#return"

export function isReturnStop(stop: TripStop): boolean {
  return stop.stopKey === RETURN_STOP_KEY
}

/**
 * Collects still to record at a stop: the driver hasn't said yes or no yet.
 *
 * `Planned` is the only outstanding value here — `Loaded` means taken and
 * `Skipped` means the driver reached it and couldn't.
 */
export function outstandingCollect(work: StopWork): TripToolRow[] {
  return work.collect.filter(isCollectOutstanding)
}

/**
 * Drops still to record at a stop: the tool is **on the truck**.
 *
 * `Loaded` is the outstanding value, and the asymmetry with `outstandingCollect`
 * is the whole point — a tool waiting to be dropped has already been collected,
 * so it is never `Planned` here. Reading `Planned` as "still to drop" (which
 * this once did) makes every drop stop look finished the moment its tools are
 * picked up, which leaves them permanently on the truck with no way to record
 * the drop and the trip unable to finish.
 *
 * A `Planned` row is one whose collect stop is still ahead — `orderViolations`
 * guarantees that stop comes first, so the driver isn't here yet — and a
 * `Skipped` one was never collected and can't be dropped. Neither is work
 * available at this stop now.
 */
export function outstandingDrop(work: StopWork): TripToolRow[] {
  return work.drop.filter(isDropOutstanding)
}

/**
 * Drops the driver may say no to here — the mirror of unticking a collect.
 *
 * One predicate rather than a rule written twice, because the checkbox and the
 * server's validation have to mean the same thing: the tool is on the truck,
 * it is waiting at *this* stop, and the stop is a job site. **A warehouse never
 * refuses** — its own yard cannot turn its own tools away, and allowing it at
 * the return stop would let a tool be refused off the very stop it was just
 * routed to, with nowhere further to go.
 */
export function refusable(work: StopWork): TripToolRow[] {
  if (work.stop.kind !== "Job") return []
  return work.drop.filter((item) => item.state === "Loaded")
}

/**
 * A stop is **done** when every item at it has finished with it — derived,
 * never stored.
 *
 * "Nothing outstanding" is not the same test, and the difference is the whole
 * of this function: `outstandingDrop` only counts `Loaded` rows, so a drop stop
 * whose tool is still `Planned` — sitting at a collect stop the driver hasn't
 * reached — has nothing outstanding while plainly not being done. Read that
 * way, the last stop of a two-stop trip wears a green Done tick from the moment
 * the trip is planned.
 *
 * So each side is asked its own question: a collect is finished once it is
 * anything but `Planned` (taken, or reached and left behind), and a drop once
 * the tool has actually landed — or was `Skipped` at its collect stop and is
 * never coming. A stored `status` on `tripstop` would be a second source of
 * truth, and would start lying the moment an item was added to a stop already
 * marked done.
 *
 * Material lines are asked the same two questions: a stop is done only when
 * its tools **and** its materials are.
 */
export function isStopDone(work: StopWork): boolean {
  const collects = [...work.collect, ...work.collectMaterials]
  const drops = [...work.drop, ...work.dropMaterials]
  if (collects.length + drops.length + work.refused.length + work.refusedMaterials.length === 0) return false
  return collects.every(isCollectFinished) && drops.every(isDropFinished)
}

/**
 * Items still on the truck when the trip is about to close — the guard
 * `completeTrip` reports on. Material lines: `stillLoadedMaterials`.
 */
export function stillLoaded(items: readonly TripToolRow[]): TripToolRow[] {
  return items.filter((item) => isOnTruck(item.state))
}

type Routed = { fromStopKey: string; toStopKey: string; state: TripToolState }

/** One kind of row split across one stop — the rule both kinds share. */
function atStop<T extends Routed>(rows: readonly T[], stopKey: string, routed: (row: T) => boolean) {
  const here = rows.filter(routed)
  return {
    collect: here.filter((row) => row.fromStopKey === stopKey),
    drop: here.filter((row) => row.toStopKey === stopKey && !isTurnedAway(row)),
    refused: here.filter((row) => row.toStopKey === stopKey && isTurnedAway(row)),
  }
}

/**
 * Splits a trip's items across its stops, in route order.
 *
 * An item whose `stopKey` resolves to no stop is dropped from every list rather
 * than crashing the screen — `fromLocation`/`toLocation` exist on the row so
 * such a trip can still be understood and repaired.
 *
 * **A refused tool's drop is routed by its state, not by its key**, and that is
 * the one rule holding the return together. The row keeps pointing at the site
 * that refused it (the only record of where that happened), so left in that
 * stop's `drop` list it would never settle: `isStopDone` would be false there
 * for good, `currentIndex` would pin the run sheet to a stop the driver has
 * left, and the card would go on offering the drop that just failed. It moves to
 * the stop where the tool actually comes off, and stays visible at the refusing
 * stop through `refused` instead.
 *
 * Material lines follow the same rule in the **same pass**, so a trip with a
 * refused tool and a refused material still synthesises one return stop.
 */
export function stopWork(trip: TripDetail): StopWork[] {
  const byKey = new Map(trip.stops.map((stop) => [stop.stopKey, stop]))
  const routed = (row: Routed) => byKey.has(row.fromStopKey) && byKey.has(row.toStopKey)

  const work: StopWork[] = [...trip.stops]
    .sort((a, b) => a.seq - b.seq || a.stopKey.localeCompare(b.stopKey))
    .map((stop) => {
      const materials = atStop(trip.materials, stop.stopKey, routed)
      return {
        stop,
        ...atStop(trip.items, stop.stopKey, routed),
        collectMaterials: materials.collect,
        dropMaterials: materials.drop,
        refusedMaterials: materials.refused,
      }
    })

  const coming = trip.items.filter((item) => isTurnedAway(item) && routed(item))
  const comingMaterials = trip.materials.filter((row) => isTurnedAway(row) && routed(row))
  if (coming.length + comingMaterials.length === 0) return work

  // The yard the load is carried to: the next warehouse the route already
  // visits, so one physical stop stays one card, and a fresh terminal one only
  // when the run would otherwise end on a job site.
  // A one-slot list rather than a `let`, because it is filled from inside
  // `hostFor` and TypeScript doesn't track assignments made in a closure.
  const terminal: StopWork[] = []
  const hostFor = (row: Routed): StopWork => {
    // `routed` already proved this resolves; `Infinity` is the safe reading if
    // that ever stops being true — no stop qualifies, so the load lands on the
    // synthesised terminal rather than on the first warehouse of the route,
    // which the driver may have left hours ago.
    const refusedAt = byKey.get(row.toStopKey)?.seq ?? Number.POSITIVE_INFINITY
    const host = work.find((entry) => entry.stop.kind === "Warehouse" && entry.stop.seq > refusedAt)
    return host ?? (terminal[0] ??= returnStop(trip))
  }
  for (const item of coming) hostFor(item).drop.push(item)
  for (const row of comingMaterials) hostFor(row).dropMaterials.push(row)

  return [...work, ...terminal]
}

/** The synthesised yard stop. Derived on every render; nothing in Bubble backs it. */
function returnStop(trip: TripDetail): StopWork {
  const lastSeq = trip.stops.reduce((max, stop) => Math.max(max, stop.seq), 0)
  return {
    stop: {
      id: "",
      tripId: trip.id,
      stopKey: RETURN_STOP_KEY,
      seq: lastSeq + 1,
      location: DEFAULT_WAREHOUSE,
      kind: "Warehouse",
    },
    collect: [],
    drop: [],
    refused: [],
    collectMaterials: [],
    dropMaterials: [],
    refusedMaterials: [],
  }
}

/**
 * A collect at a job site made for some **other** job — the pickup half of a
 * site-to-site transfer, or a leg with no request at all.
 *
 * `oneJourney` gives a transferred tool the *delivery's* `requestId`, so that
 * request's contact is someone at the far end, not at this site. Screens asking
 * "who do I talk to here" for such a collect use the site's own contact
 * instead (`listSiteContacts`). `request` is the item's request as looked up
 * by the caller — `undefined` when it has none or it couldn't be found.
 */
export function isTransferCollect(
  stop: Pick<TripStop, "kind" | "location">,
  request: { job: string } | undefined
): boolean {
  return stop.kind === "Job" && request?.job !== stop.location
}

/** Whether this stop collects anything — tool or material — on behalf of another job. */
export function hasTransferCollect(work: StopWork, requests: ReadonlyMap<string, { job: string }>): boolean {
  return [...work.collect, ...work.collectMaterials].some((item) =>
    isTransferCollect(work.stop, requests.get(item.requestId))
  )
}

/** The job sites on a route with at least one transfer collect. */
export function transferSites(
  work: readonly StopWork[],
  requests: ReadonlyMap<string, { job: string }>
): string[] {
  const sites = work.filter((entry) => hasTransferCollect(entry, requests)).map((entry) => entry.stop.location)
  return [...new Set(sites)]
}

/** What a drop at this stop writes. The one rule that makes pickups and deliveries the same code path. */
export function dropOutcome(kind: StopKind): { status: "Delivered" | "Available"; verb: string } {
  return kind === "Warehouse" ? { status: "Available", verb: "Return" } : { status: "Delivered", verb: "Drop off" }
}
