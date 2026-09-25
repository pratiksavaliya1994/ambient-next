import type { MaterialKind } from "@/lib/bubble/requested-materials-types"
import type { TripToolState } from "@/lib/trips/plan-types"

/**
 * A `tripmaterial` row — one material line on one trip — as the app sees it.
 *
 * Client-safe. 5B only *reads* these (nothing creates them until 5D), but the
 * assign floor check and Close request's guard both need them now, so the shape
 * lands here and 5D adds the stop-work halves beside it.
 *
 * `state` reuses `triptool`'s vocabulary on purpose — the master doc's state
 * table is the tool one, applied to both row kinds.
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
  state: TripToolState
  createdAt: string | null
}
