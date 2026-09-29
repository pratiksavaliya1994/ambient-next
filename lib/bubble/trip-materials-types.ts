import type { MaterialKind } from "@/lib/bubble/requested-materials-types"
import type { StopWork } from "@/lib/bubble/trips-types"
import { isOnTruck, type TripMaterialState, type TripStatus, type TripToolState } from "@/lib/trips/plan-types"

/**
 * A `tripmaterial` row — one material line on one trip — as the app sees it,
 * plus the material halves of the stop-work rules in `trips-types.ts`.
 *
 * Client-safe: the run sheet and the builder read these in the browser.
 *
 * `state` reuses `triptool`'s vocabulary on purpose — the master doc's state
 * table is the tool one, applied to both row kinds. The row-level predicates
 * below are **the** definitions: `trips-types.ts` asks them about tool rows
 * too, so "outstanding" and "finished" can't mean one thing for a tool and
 * another for a material.
 */
export type TripMaterialRow = {
  id: string
  tripId: string
  requestId: string
  lineId: string
  /** Empty for a non-inventory line. */
  materialId: string | null
  name: string
  unit: string
  kind: MaterialKind | null
  /** Planned for this trip. */
  qty: number
  /** Set on load. Delivery: `= qty`. Pickup: what the driver counted. */
  actualQty: number | null
  fromStopKey: string
  fromLocation: string
  toStopKey: string
  toLocation: string
  state: TripMaterialState
  createdAt: string | null
}

/**
 * A row read **by line**, carrying its trip's status — what `lineProgress`'s
 * open-trip rule needs. `null` means the trip row is gone, which holds nothing.
 */
export type LineTripRow = TripMaterialRow & { tripStatus: TripStatus | null }

type Stated = { state: TripToolState }

/** A collect still to record: the driver hasn't said yes or no yet. */
export const isCollectOutstanding = (row: Stated) => row.state === "Planned"

/** A drop still to record: on the truck, whether or not a site already turned it away. */
export const isDropOutstanding = (row: Stated) => row.state === "Loaded" || row.state === "Refused"

/** A collect the stop has finished with — taken, or reached and left behind. */
export const isCollectFinished = (row: Stated) => row.state !== "Planned"

/** A drop the stop has finished with — landed, never coming (skipped at its collect), or unloaded at the yard. */
export const isDropFinished = (row: Stated) =>
  row.state === "Dropped" || row.state === "Skipped" || row.state === "Returned"

/** A row a site turned away — on its way home, wherever its row still points. */
export const isTurnedAway = (row: Stated) => row.state === "Refused" || row.state === "Returned"

/** `outstandingCollect` for material lines. */
export function outstandingCollectMaterials(work: StopWork): TripMaterialRow[] {
  return work.collectMaterials.filter(isCollectOutstanding)
}

/** `outstandingDrop` for material lines. */
export function outstandingDropMaterials(work: StopWork): TripMaterialRow[] {
  return work.dropMaterials.filter(isDropOutstanding)
}

/** `refusable` for material lines: on the truck, due here, and a job site. A warehouse never refuses. */
export function refusableMaterials(work: StopWork): TripMaterialRow[] {
  if (work.stop.kind !== "Job") return []
  return work.dropMaterials.filter((row) => row.state === "Loaded")
}

/** `20 bag` — what was actually loaded once it was, else what was planned. */
export function materialQtyLabel(row: { qty: number; actualQty?: number | null; unit: string }): string {
  return [row.actualQty ?? row.qty, row.unit.trim()].filter(Boolean).join(" ")
}

/** `stillLoaded` for material lines — what the finish-trip guard names beside the tools. */
export function stillLoadedMaterials(rows: readonly TripMaterialRow[]): TripMaterialRow[] {
  return rows.filter((row) => isOnTruck(row.state))
}
