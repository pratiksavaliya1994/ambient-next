import { DEFAULT_WAREHOUSE, isPickupRequest, isWarehouseDestination } from "@/lib/bubble/enums"
import { isLinkedTransfer, lineProgress, type MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { LineTripRow } from "@/lib/bubble/trip-materials-types"
import type { MaterialMovement } from "@/lib/trips/plan-types"

/**
 * The material half of the movement pool: what of each assigned line is still
 * to send, and turning a selection back into `MaterialMovement`s.
 *
 * Pure and client-safe, for the reason `movement-types.ts` is: the builder and
 * the server action run **the same** selection, so the server's re-derivation
 * can't drift from what the browser previewed.
 *
 * A line isn't blocked the way a claimed tool is. A draft holding 12 of 20
 * simply leaves 8 in the pool, and a line with nothing outstanding isn't shown.
 */

/** One line with units still to plan. `qty` is left to the selection; `outstanding` is its ceiling. */
export type OutstandingMaterial = Omit<MaterialMovement, "qty"> & {
  /** What the warehouse allocated (`assignedQty`); on a pickup, the whole estimate — it needs no approval. */
  assigned: number
  /** Assigned but on no open trip yet. Always ≥ 1 here. */
  outstanding: number
  /** A pickup line (5F): its quantity is the PM's estimate, and the driver counts it at the stop. */
  pickup: boolean
  /**
   * A linked transfer goes on **one trip, whole**: the qty must be all of
   * `outstanding`, since linking sized it to what the delivery needs. Any
   * other line — an unlinked pickup included (user decision 2026-10-06) — can
   * be split across trips.
   */
  fixedQty: boolean
  /**
   * A linked transfer's `to` is its delivery's job. The group's warehouse
   * choice never moves it.
   */
  fixedDestination: boolean
  /**
   * A linked transfer's delivery request — `transferToRequestId`, `""`
   * otherwise. "Add to a trip" from that delivery preselects it, since the
   * delivery's materials are coming on the pickup's line.
   */
  feedsRequestId: string
}

type PoolRequest = { id: string; job: string; delivery: boolean; pickup: boolean }

/**
 * A request's lines with something left to send.
 *
 * - **Delivery:** `Warehouse → request.job`, any part of what's assigned.
 * - **Pickup (5F):** `request.job → the group's warehouse`, any part of what
 *   no trip has claimed; or a linked transfer's `→ transferToLocation`, the
 *   whole estimate.
 *
 * A request whose job is a warehouse name is left out: a delivery's drop would
 * credit a site row to the yard, and a pickup's collect would debit one.
 *
 * `excludeTripId` is the trip being edited: its own rows aren't a claim on
 * itself — the same rule `listToolClaims` applies to tools, applied to
 * quantities.
 */
export function outstandingMaterialsFor(
  request: PoolRequest,
  lines: readonly MaterialLine[],
  tripRows: readonly LineTripRow[],
  excludeTripId?: string
): OutstandingMaterial[] {
  if (isWarehouseDestination(request.job)) return []
  const pickup = isPickupRequest(request)

  const counted = excludeTripId ? tripRows.filter((row) => row.tripId !== excludeTripId) : tripRows
  const pool: OutstandingMaterial[] = []
  for (const line of lines) {
    // A delivery line waits for the warehouse to assign it. A pickup line needs
    // no approval, like a pickup's tools, so it's in the pool from creation.
    if (!pickup && line.assignedQty <= 0) continue
    const { assigned, outstanding } = lineProgress(line, counted, { pickup })
    if (outstanding <= 0) continue
    const linked = pickup && isLinkedTransfer(line)
    pool.push({
      lineId: line.id,
      requestId: request.id,
      materialId: line.materialId,
      name: line.name,
      unit: line.unit ?? "",
      kind: line.kind,
      from: pickup ? request.job : DEFAULT_WAREHOUSE,
      to: linked ? line.transferToLocation : pickup ? DEFAULT_WAREHOUSE : request.job,
      assigned,
      outstanding,
      pickup,
      fixedQty: linked,
      fixedDestination: !pickup || linked,
      feedsRequestId: linked ? line.transferToRequestId : "",
    })
  }
  return pool.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * A requested quantity outside `1..outstanding`, or — for a linked transfer
 * (`whole`) — anything but all of it. `outstanding` is 0 for a line no longer
 * in the pool at all.
 */
export type InvalidMaterial = {
  lineId: string
  name: string
  qty: number
  outstanding: number
  unit: string
  whole?: boolean
}

/** The pool groups as `selectMaterialMovements` reads them. `RequestMovements` is one. */
type MaterialGroup = {
  requestId: string
  destination: string
  destinationIsChoosable: boolean
  materials: readonly OutstandingMaterial[]
}

/**
 * Turns a selection — line id → quantity for this trip — back into
 * `MaterialMovement`s.
 *
 * A quantity outside `1..outstanding` is **refused by name, never clamped**.
 * Quietly sending 8 when the dispatcher typed 12 would plan a trip nobody
 * chose, the same reason `selectMovements` returns blocked tools rather than
 * skipping them. A linked transfer takes all of `outstanding` or nothing.
 *
 * `destinationByRequest` is the pickup groups' warehouse choice, as
 * `selectMovements` takes it: an unlinked pickup line follows its request's
 * tools to the same yard. A linked transfer never moves.
 */
export function selectMaterialMovements(
  groups: readonly MaterialGroup[],
  selection: ReadonlyMap<string, number>,
  destinationByRequest: ReadonlyMap<string, string> = new Map()
): { materials: MaterialMovement[]; invalid: InvalidMaterial[] } {
  const byLine = new Map(
    groups.flatMap((group) => {
      const to = destinationByRequest.get(group.requestId) ?? group.destination
      return group.materials.map((material) => [
        material.lineId,
        { material, to: group.destinationIsChoosable && !material.fixedDestination ? to : material.to },
      ])
    })
  )

  const materials: MaterialMovement[] = []
  const invalid: InvalidMaterial[] = []
  for (const [lineId, qty] of selection) {
    const entry = byLine.get(lineId)
    if (!entry) {
      invalid.push({ lineId, name: "A material", qty, outstanding: 0, unit: "" })
      continue
    }
    const { material: line, to } = entry
    const wrongQty = line.fixedQty ? qty !== line.outstanding : !Number.isInteger(qty) || qty < 1 || qty > line.outstanding
    if (wrongQty) {
      invalid.push({ lineId, name: line.name, qty, outstanding: line.outstanding, unit: line.unit, whole: line.fixedQty })
      continue
    }
    materials.push({
      lineId: line.lineId,
      requestId: line.requestId,
      materialId: line.materialId,
      name: line.name,
      unit: line.unit,
      kind: line.kind,
      qty,
      from: line.from,
      to,
    })
  }
  return { materials, invalid }
}

/** The sentence the builder and the action both show for the first refused line. */
export function invalidMaterialMessage(invalid: readonly InvalidMaterial[]): string {
  const [first] = invalid
  const units = `${first.outstanding}${first.unit ? ` ${first.unit}` : ""}`
  const reason =
    first.outstanding === 0
      ? `${first.name} has nothing left to send`
      : first.whole
        ? `${first.name} is a transfer and goes on one trip whole (${units})`
        : `only ${units} of ${first.name} left to send`
  const rest = invalid.length > 1 ? ` (and ${invalid.length - 1} more)` : ""
  return `${reason[0].toUpperCase()}${reason.slice(1)}${rest}. Reload the builder.`
}
