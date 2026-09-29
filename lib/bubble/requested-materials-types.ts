import type { TripMaterialRow } from "@/lib/bubble/trip-materials-types"
import { isOpenTrip, type TripStatus, type TripToolState } from "@/lib/trips/plan-types"

/**
 * A request's material lines — structured `requestedmaterials` rows — and the
 * pure maths every screen shares about them.
 *
 * Client-safe on purpose: the assign card, the trip builder and
 * `request.status` must all read the same numbers off `lineProgress`, the same
 * reason `lib/trips/request-progress.ts` is pure.
 */

/**
 * `requestedmaterials.kind`. Text in Bubble, not an option set. **Empty means a
 * legacy free-text row** — the pre-phase-5 rows, plus the one `new-request`
 * still writes for any request with materials text (5B §1.4).
 */
export const MATERIAL_KIND = ["Inventory", "NonInventory"] as const
export type MaterialKind = (typeof MATERIAL_KIND)[number]

export type MaterialLine = {
  /** The row's `_id`. Stable — lines are updated in place, never recreated. */
  id: string
  requestId: string
  kind: MaterialKind
  /** `materialitem._id`. `null` on a non-inventory line. */
  materialId: string | null
  /** Snapshot of the item name, or the free-text description. */
  name: string
  unit: string | null
  /** Asked for. `null` on a non-inventory line means one lot. */
  quantity: number | null
  /** Allocated by the warehouse manager. For an inventory delivery line, units held out of stock. */
  assignedQty: number
}

/**
 * A line ready to send to `new-request`: inventory lines already resolved
 * against a fresh catalogue read, so `name` and `unit` are the catalogue's and
 * never the browser's.
 */
export type ResolvedMaterialLine = Pick<MaterialLine, "kind" | "materialId" | "name" | "unit" | "quantity">

/** The quantity progress maths counts. A blank one is one lot. */
export function effectiveQty(line: Pick<MaterialLine, "quantity">): number {
  return line.quantity !== null && line.quantity > 0 ? line.quantity : 1
}

/**
 * Whether assigning this line draws stock — **exactly** the test
 * `assign-material-line` makes inside Bubble (5B §1.3): an inventory line on a
 * request that isn't a pickup. Mirrored here only so the action can refuse a
 * short-stock save before sending it; Bubble computes its own and never trusts
 * this one.
 *
 * `request.pickup`, not `isPickupRequest`: Bubble reads the raw flag, so a row
 * carrying both flags holds no stock there, and this has to agree.
 */
export function holdsStock(line: Pick<MaterialLine, "kind">, request: { pickup: boolean }): boolean {
  return line.kind === "Inventory" && !request.pickup
}

/** One line as text: `Name: qty unit`, or just `Name` for a lot with no quantity. */
export function formatMaterialLine(line: Pick<MaterialLine, "name" | "quantity" | "unit">): string {
  if (line.quantity === null) return line.name
  return `${line.name}: ${[line.quantity, line.unit?.trim()].filter(Boolean).join(" ")}`
}

/**
 * The one codec for a request's materials as text — the legacy `materials`
 * field, each row's own `materials`, and the WhatsApp message all come from
 * here, so the old Bubble UI and the notification can't disagree.
 *
 * Newline-joined, which is what `parseMaterialsList` splits the legacy field
 * on.
 */
export function formatMaterialsSummary(lines: readonly Pick<MaterialLine, "name" | "quantity" | "unit">[]): string {
  return lines.map(formatMaterialLine).join("\n")
}

/**
 * Trip-row states that hold part of a line's allocation: on a draft, in the
 * van, landed, or turned away and still riding. `Skipped` is back in the pool
 * and `Returned` has already given its units back, so neither counts.
 */
const COMMITTED_STATES: readonly TripToolState[] = ["Planned", "Loaded", "Dropped", "Refused"]

/**
 * Trip-row states that mean the units are **still moving** — Close request
 * refuses while any line has one, as it does for a tool in transit.
 */
export const IN_MOTION_STATES: readonly TripToolState[] = ["Planned", "Loaded", "Refused"]

export type LineProgress = {
  /** `effectiveQty` — what was asked for. */
  requested: number
  assigned: number
  /** Σ qty over the line's committed trip rows. The floor an unassign can't go below. */
  onTrips: number
  /** Σ qty over `Dropped` rows. */
  delivered: number
  /** Assigned but not yet on any trip — what the builder can still plan. */
  outstanding: number
  done: boolean
}

/**
 * The master doc's per-line rule, in one place.
 *
 * Delivery only for now: **done** is delivered ≥ requested. 5F adds the pickup
 * branch (done on one `Dropped` row, whatever was counted).
 *
 * **A `Planned` row counts only while its trip is open.** One can outlive a
 * completed trip whose collect was never recorded, and it holds nothing. The
 * rule applies only when the row carries `tripStatus` (`listTripMaterialsForLines`
 * sets it; `null` = the trip row is gone). A row without the field is read as
 * committed, as before.
 */
export function lineProgress(
  line: MaterialLine,
  tripRows: readonly (TripMaterialRow & { tripStatus?: TripStatus | null })[]
): LineProgress {
  let onTrips = 0
  let delivered = 0
  for (const row of tripRows) {
    if (row.lineId !== line.id) continue
    const tripClosed = row.tripStatus !== undefined && (row.tripStatus === null || !isOpenTrip(row.tripStatus))
    const stale = row.state === "Planned" && tripClosed
    if (COMMITTED_STATES.includes(row.state) && !stale) onTrips += row.qty
    if (row.state === "Dropped") delivered += row.qty
  }

  const requested = effectiveQty(line)
  return {
    requested,
    assigned: line.assignedQty,
    onTrips,
    delivered,
    outstanding: Math.max(0, line.assignedQty - onTrips),
    done: delivered >= requested,
  }
}
