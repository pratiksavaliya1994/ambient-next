import type { CandidateTool } from "@/lib/bubble/assigned-tools-types"
import type { RequestStatus } from "@/lib/bubble/enums"
import type { Movement } from "@/lib/trips/plan-types"

/**
 * The movement-pool shapes, plus the one pure function that turns a selection
 * into movements.
 *
 * Split from `lib/trips/movements.ts` because that module is `server-only` and
 * the trip builder needs all of this in the browser — it re-plans the route on
 * every tick. Same split as `assigned-tools-types.ts` and `reference-types.ts`,
 * for the same reason.
 *
 * `selectMovements` living here rather than in the server module is what lets
 * the client and the server run **the same** selection logic. They already
 * share `planTrip`; sharing this too is what makes the server's re-derivation a
 * genuine re-derivation rather than a second implementation that can drift.
 */

/** Why a tool can't go on a trip right now — `null` means it can. */
export type MovementBlock =
  | { kind: "claimed"; tripId: string; driver: string | null }
  | { kind: "condition"; detail: string }

export type OutstandingMovement = Movement & {
  /** The live `tools` row, for the row's location and status badges. */
  tool: CandidateTool
  block: MovementBlock | null
}

export type RequestMovements = {
  requestId: string
  job: string
  /** `requestDateStart` — what the group header sorts and reads by. */
  start: string | null
  timeRange: string | null
  fieldPm: string | null
  status: RequestStatus
  direction: "delivery" | "pickup"
  /**
   * Where this request's tools are headed.
   *
   * For a delivery it is `request.job` and is **not** a choice. For a pickup it
   * is a warehouse, and it *is* a choice — the builder offers
   * `WAREHOUSE_JOB_NAMES` and this is only the default. That single difference
   * is the entire delivery/pickup asymmetry in the trip flow.
   */
  destination: string
  /** Changing `destination` is meaningful only for a pickup. */
  destinationIsChoosable: boolean
  movements: OutstandingMovement[]
  /** Assigned tools that have already arrived — the "3 of 8 still to go" numerator. */
  landed: number
  /** Assigned tools in total, landed included. */
  total: number
  /** Non-consumable requested slots still short. Surfaced so a PM can see a trip would go out incomplete. */
  unfilledSlots: number
}

/**
 * Turns ticked tool ids back into `Movement`s.
 *
 * Blocked tools are returned separately rather than silently skipped: the
 * action needs to *refuse* with a reason, and quietly planning a trip without a
 * tool the manager ticked would be worse than failing.
 */
export function selectMovements(
  groups: readonly RequestMovements[],
  toolIds: ReadonlySet<string>,
  destinationByRequest: ReadonlyMap<string, string>
): { movements: Movement[]; blocked: OutstandingMovement[] } {
  const movements: Movement[] = []
  const blocked: OutstandingMovement[] = []

  for (const group of groups) {
    const destination = destinationByRequest.get(group.requestId) ?? group.destination
    for (const movement of group.movements) {
      if (!toolIds.has(movement.toolId)) continue
      if (movement.block) {
        blocked.push(movement)
        continue
      }
      movements.push({
        toolId: movement.toolId,
        toolName: movement.toolName,
        toolType: movement.toolType,
        requestId: movement.requestId,
        from: movement.from,
        to: group.destinationIsChoosable ? destination : movement.to,
      })
    }
  }

  return { movements, blocked }
}

/**
 * The pool as the builder should *show* it — tools another trip has already
 * claimed are dropped, not greyed out.
 *
 * Every other block stays visible with its reason: "not available — Broken" is
 * something the warehouse manager acts on here. A claim is not. It says only
 * that someone else got there first, and the fix lives on that other trip, so a
 * disabled row with a red edge was pure noise in a list a dispatcher scans
 * twenty tools deep. A request left with nothing movable disappears with them.
 *
 * Deliberately *not* applied inside `listOutstandingMovements`: the save action
 * re-derives from the same pool, and `selectMovements` needs the claimed rows
 * present to refuse by name when a tool is claimed between load and submit.
 * This is a view filter, and it lives only on the way to the screen.
 */
export function shownMovements(groups: readonly RequestMovements[]): RequestMovements[] {
  const shown: RequestMovements[] = []

  for (const group of groups) {
    const movements = group.movements.filter((movement) => movement.block?.kind !== "claimed")
    if (movements.length === 0) continue
    shown.push({ ...group, movements })
  }

  return shown
}
