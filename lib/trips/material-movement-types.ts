import { DEFAULT_WAREHOUSE, isPickupRequest, isWarehouseDestination } from "@/lib/bubble/enums"
import { lineProgress, type MaterialLine } from "@/lib/bubble/requested-materials-types"
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
  /** `requestedmaterials.assignedQty` — what the warehouse allocated. */
  assigned: number
  /** Assigned but on no open trip yet. Always ≥ 1 here. */
  outstanding: number
}

type PoolRequest = { id: string; job: string; delivery: boolean; pickup: boolean }

/**
 * A request's lines with something left to send.
 *
 * **Delivery lines only, `Warehouse → request.job`.** Pickup lines and
 * transfers are 5F. A delivery "to" a warehouse name is left out as well. Its
 * drop would credit a site row to the yard, and site stock never holds the
 * warehouse.
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
  if (isPickupRequest(request) || isWarehouseDestination(request.job)) return []

  const counted = excludeTripId ? tripRows.filter((row) => row.tripId !== excludeTripId) : tripRows
  const pool: OutstandingMaterial[] = []
  for (const line of lines) {
    if (line.assignedQty <= 0) continue
    const { outstanding } = lineProgress(line, counted)
    if (outstanding <= 0) continue
    pool.push({
      lineId: line.id,
      requestId: request.id,
      materialId: line.materialId,
      name: line.name,
      unit: line.unit ?? "",
      kind: line.kind,
      from: DEFAULT_WAREHOUSE,
      to: request.job,
      assigned: line.assignedQty,
      outstanding,
    })
  }
  return pool.sort((a, b) => a.name.localeCompare(b.name))
}

/** A requested quantity outside `1..outstanding`. `outstanding` is 0 for a line no longer in the pool at all. */
export type InvalidMaterial = { lineId: string; name: string; qty: number; outstanding: number; unit: string }

/**
 * Turns a selection — line id → quantity for this trip — back into
 * `MaterialMovement`s.
 *
 * A quantity outside `1..outstanding` is **refused by name, never clamped**.
 * Quietly sending 8 when the dispatcher typed 12 would plan a trip nobody
 * chose, the same reason `selectMovements` returns blocked tools rather than
 * skipping them.
 */
export function selectMaterialMovements(
  groups: readonly { materials: readonly OutstandingMaterial[] }[],
  selection: ReadonlyMap<string, number>
): { materials: MaterialMovement[]; invalid: InvalidMaterial[] } {
  const byLine = new Map(groups.flatMap((group) => group.materials.map((material) => [material.lineId, material])))

  const materials: MaterialMovement[] = []
  const invalid: InvalidMaterial[] = []
  for (const [lineId, qty] of selection) {
    const line = byLine.get(lineId)
    if (!line) {
      invalid.push({ lineId, name: "A material", qty, outstanding: 0, unit: "" })
      continue
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > line.outstanding) {
      invalid.push({ lineId, name: line.name, qty, outstanding: line.outstanding, unit: line.unit })
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
      to: line.to,
    })
  }
  return { materials, invalid }
}

/** The sentence the builder and the action both show for the first refused line. */
export function invalidMaterialMessage(invalid: readonly InvalidMaterial[]): string {
  const [first] = invalid
  const reason =
    first.outstanding === 0
      ? `${first.name} has nothing left to send`
      : `only ${first.outstanding}${first.unit ? ` ${first.unit}` : ""} of ${first.name} left to send`
  const rest = invalid.length > 1 ? ` (and ${invalid.length - 1} more)` : ""
  return `${reason[0].toUpperCase()}${reason.slice(1)}${rest}. Reload the builder.`
}
