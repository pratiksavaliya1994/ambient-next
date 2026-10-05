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
  /**
   * Allocated by the warehouse manager. For an inventory delivery line, units
   * held out of stock. **Not used on a pickup line**, which needs no approval
   * (`lineProgress` counts it assigned in full); it stays 0 there.
   */
  assignedQty: number
  /**
   * 5F transfers, set on a **pickup** line only, all three together: the
   * delivery line it feeds, that line's request, and that request's job (the
   * trip destination, a snapshot). `""` when the line goes to a warehouse.
   */
  transferToLineId: string
  transferToRequestId: string
  transferToLocation: string
}

/**
 * A line ready to send to `new-request`: inventory lines already resolved
 * against a fresh catalogue read, so `name` and `unit` are the catalogue's and
 * never the browser's.
 */
export type ResolvedMaterialLine = Pick<MaterialLine, "kind" | "materialId" | "name" | "unit" | "quantity">

/** Whether this pickup line is linked to a delivery line — a site-to-site transfer. */
export function isLinkedTransfer(line: Pick<MaterialLine, "transferToLineId">): boolean {
  return line.transferToLineId !== ""
}

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
  /** `effectiveQty` — what was asked for. A pickup's is the PM's estimate. */
  requested: number
  assigned: number
  /**
   * Units committed to trips — the floor an unassign can't go below. Delivery:
   * Σ qty over committed rows. Pickup: the estimate while a trip holds the line,
   * then what was counted.
   */
  onTrips: number
  /** Delivery: Σ qty over `Dropped` rows, plus linked transfers dropped here. Pickup: what came back, as counted. */
  delivered: number
  /** Assigned but not yet on any trip — what the builder can still plan. Never includes linked transfers. */
  outstanding: number
  /** Delivery only: units coming from linked pickup lines at other sites. `0` on a pickup line. */
  linkedCoverage: number
  done: boolean
}

type ProgressRow = TripMaterialRow & { tripStatus?: TripStatus | null }

/**
 * Who `lineProgress` is asking about. Both optional, so a delivery caller with
 * no transfers in play passes nothing.
 */
export type LineContext = {
  /** The line's request is a pickup (`isPickupRequest`). */
  pickup?: boolean
  /**
   * Pickup lines linked to delivery lines — any superset, matched on
   * `transferToLineId`. **Their trip rows must be in `tripRows` too.**
   */
  linked?: readonly MaterialLine[]
}

/**
 * **A `Planned` row counts only while its trip is open.** One can outlive a
 * completed trip whose collect was never recorded, and it holds nothing. The
 * rule applies only when the row carries `tripStatus` (`listTripMaterialsForLines`
 * sets it; `null` = the trip row is gone). A row without the field is read as
 * committed, as before.
 */
function isStalePlan(row: ProgressRow): boolean {
  const tripClosed = row.tripStatus !== undefined && (row.tripStatus === null || !isOpenTrip(row.tripStatus))
  return row.state === "Planned" && tripClosed
}

/**
 * Where a pickup line stands, from its own trip rows. **One trip, whole line**:
 * there is nothing to split an unknown quantity by.
 *
 * - `done`: one `Dropped` or `Returned` row, whatever was counted. `Returned`
 *   is a transfer the receiving site refused, landed at the yard.
 * - `live`: a trip holds it — `Planned` on an open trip, `Loaded`, or `Refused`
 *   and still riding.
 * - `idle`: neither. A `Skipped` line is idle again, back in the pool.
 */
export function pickupLineStatus(line: Pick<MaterialLine, "id">, tripRows: readonly ProgressRow[]) {
  const own = tripRows.filter((row) => row.lineId === line.id)
  if (own.some((row) => row.state === "Dropped" || row.state === "Returned")) return "done" as const
  if (own.some((row) => IN_MOTION_STATES.includes(row.state) && !isStalePlan(row))) return "live" as const
  return "idle" as const
}

/** What a row says was actually moved: the driver's count once there is one, else the plan. */
const movedQty = (row: TripMaterialRow) => row.actualQty ?? row.qty

/**
 * The master doc's per-line rule, in one place.
 *
 * **Delivery:** done is delivered ≥ requested. Linked transfers (5F) count
 * toward `delivered` once dropped at this line's job, and toward
 * `linkedCoverage` from the moment they're linked; `outstanding` is the line's
 * own warehouse units only, so it ignores them.
 *
 * **Pickup:** see `pickupLineStatus`. A pickup line needs **no approval** — it
 * counts as assigned in full from the moment the request is created, the way a
 * pickup's tools are assigned by being named. `assignedQty` stays 0 on these
 * rows and is never read for them. Outstanding is the whole estimate while the
 * line is idle, else 0.
 */
export function lineProgress(
  line: MaterialLine,
  tripRows: readonly ProgressRow[],
  { pickup = false, linked = [] }: LineContext = {}
): LineProgress {
  const requested = effectiveQty(line)
  if (pickup) return pickupProgress(line, tripRows, requested)

  let onTrips = 0
  let delivered = 0
  for (const row of tripRows) {
    if (row.lineId !== line.id) continue
    if (COMMITTED_STATES.includes(row.state) && !isStalePlan(row)) onTrips += row.qty
    if (row.state === "Dropped") delivered += row.qty
  }

  let linkedCoverage = 0
  for (const supply of linked) {
    if (supply.transferToLineId !== line.id) continue
    const rows = tripRows.filter((row) => row.lineId === supply.id)
    linkedCoverage += transferCoverage(supply, rows)
    for (const row of rows) {
      if (row.state === "Dropped" && row.toLocation === supply.transferToLocation) delivered += movedQty(row)
    }
  }

  return {
    requested,
    assigned: line.assignedQty,
    onTrips,
    delivered,
    outstanding: Math.max(0, line.assignedQty - onTrips),
    linkedCoverage,
    done: delivered >= requested,
  }
}

function pickupProgress(line: MaterialLine, tripRows: readonly ProgressRow[], requested: number): LineProgress {
  const status = pickupLineStatus(line, tripRows)
  const collected = tripRows
    .filter((row) => row.lineId === line.id && (row.state === "Dropped" || row.state === "Returned"))
    .reduce((sum, row) => sum + movedQty(row), 0)
  return {
    requested,
    // Approved by being on the request — see `lineProgress`.
    assigned: requested,
    onTrips: status === "live" ? requested : collected,
    delivered: collected,
    outstanding: status === "idle" ? requested : 0,
    linkedCoverage: 0,
    done: status === "done",
  }
}

/**
 * What one linked pickup line is worth to its delivery line: the estimate until
 * the driver counts it, then the count. A transfer the receiving site turned
 * away (`Refused`, then `Returned` at the yard) is worth nothing — it is never
 * coming — so the delivery's coverage drops back and its assign bound reopens.
 */
function transferCoverage(supply: MaterialLine, rows: readonly ProgressRow[]): number {
  const decided = rows.filter((row) => row.state !== "Planned" && row.state !== "Skipped").at(-1)
  if (!decided) return effectiveQty(supply)
  return decided.state === "Loaded" || decided.state === "Dropped" ? movedQty(decided) : 0
}
