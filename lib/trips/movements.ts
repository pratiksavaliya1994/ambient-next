import "server-only"

import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { buildSlots, type CandidateTool } from "@/lib/bubble/assigned-tools-types"
import { DEFAULT_WAREHOUSE, isPickupRequest, type RequestStatus } from "@/lib/bubble/enums"
import { listToolTypes } from "@/lib/bubble/reference"
import { listRequestsByStatus, type ToolRequest } from "@/lib/bubble/requests"
import { listToolClaims } from "@/lib/bubble/trips-read"
import { isAssignable } from "@/lib/bubble/tool-enums"
import { NO_LOCATION } from "@/lib/bubble/pickup-tools-types"
import { hasLanded, requestProgress } from "@/lib/trips/request-progress"
import type { MovementBlock, OutstandingMovement, RequestMovements } from "@/lib/trips/movement-types"

export type { MovementBlock, OutstandingMovement, RequestMovements }
export { selectMovements } from "@/lib/trips/movement-types"

/**
 * Everything still waiting to be moved — the trip builder's left-hand pool.
 *
 * This is where "dispatch selects tools, not requests" actually happens: the
 * unit here is one physical tool with somewhere to be, and a request is only a
 * heading it is grouped under.
 *
 * **Deliveries and pickups both.** The only difference between them is where
 * the tool is going, and that is resolved here (`destination`) so everything
 * downstream — the planner, the validator, the workflows — stays
 * direction-agnostic.
 */

/**
 * Statuses worth reading. **`New` is deliberately absent**: a request with no
 * `assignedtools` rows contributes no movements by definition, and `New` is by
 * far the largest bucket (~1,550 legacy rows carry no `status` at all and read
 * as `New`). Reading it would be one expensive query for nothing.
 */
const SOURCE_STATUSES: readonly RequestStatus[] = [
  "Assigned",
  "In Transit",
  "Partially Delivered",
  "Partially Returned",
]

/**
 * Every outstanding movement, grouped by request and sorted by when the request
 * is due.
 *
 * Six reads regardless of how many requests come back: four status queries in
 * parallel, then one `in` for their `assignedtools`, one for the `tools`
 * themselves, and the claim lookup (which is two of its own).
 *
 * `excludeTripId` is the trip currently being edited. Its own tools are claimed
 * by it, and a draft holding a tool is not a reason that draft can't hold it —
 * without this the edit builder shows every tool on the trip as blocked and
 * plans no route at all.
 */
export async function listOutstandingMovements(excludeTripId?: string): Promise<RequestMovements[]> {
  const requests = (await Promise.all(SOURCE_STATUSES.map((status) => listRequestsByStatus(status)))).flat()
  if (requests.length === 0) return []

  const assignedRows = await listAssignedTools(requests.map((request) => request.id))
  if (assignedRows.length === 0) return []

  const toolIds = [...new Set(assignedRows.map((row) => row.toolId))]
  const [tools, toolTypes, claims] = await Promise.all([
    listToolsByIds(toolIds),
    listToolTypes(),
    listToolClaims(toolIds, excludeTripId),
  ])
  const toolsById = new Map(tools.map((tool) => [tool.id, tool]))

  const rowsByRequest = new Map<string, typeof assignedRows>()
  for (const row of assignedRows) {
    rowsByRequest.set(row.requestId, [...(rowsByRequest.get(row.requestId) ?? []), row])
  }

  const groups: RequestMovements[] = []

  for (const request of requests) {
    const rows = rowsByRequest.get(request.id) ?? []
    if (rows.length === 0) continue

    const pickup = isPickupRequest(request)
    const destination = pickup ? DEFAULT_WAREHOUSE : request.job

    const { slots } = buildSlots(request.tools, rows, toolTypes)
    const unfilledSlots = slots.filter((slot) => !slot.consumable && slot.toolIds.length < slot.requested).length

    const movements: OutstandingMovement[] = []
    for (const row of rows) {
      const tool = toolsById.get(row.toolId)
      // An `assignedtools` row pointing at a deleted `tools` row: nothing to
      // name, nothing to move. It survives only in the group's `total`.
      if (!tool) continue
      // Already where this request was sending it — nothing left to drive.
      if (hasLanded(request, tool)) continue

      movements.push({
        toolId: tool.id,
        toolName: tool.name,
        toolType: row.toolType,
        requestId: request.id,
        from: originOf(tool),
        to: destination,
        tool,
        block: blockFor(tool, claims.get(tool.id)),
      })
    }

    if (movements.length === 0) continue

    const progress = requestProgress(request, rows, toolsById, unfilledSlots)

    groups.push({
      requestId: request.id,
      job: request.job,
      start: request.start,
      timeRange: request.timeRange,
      fieldPm: request.fieldPm,
      status: request.status,
      direction: pickup ? "pickup" : "delivery",
      destination,
      destinationIsChoosable: pickup,
      movements: movements.sort((a, b) => a.toolName.localeCompare(b.toolName)),
      landed: progress.landed,
      total: progress.assigned,
      unfilledSlots,
    })
  }

  return groups.sort(byDue)
}

/**
 * Where the planner should collect this tool from.
 *
 * A blank or `NO_LOCATION` origin is treated as the warehouse, matching
 * `isWarehouseLocation`'s long-standing leniency: an unset location is a data
 * gap, and inventing a phantom job-site stop out of one would send a driver
 * nowhere. Everything else — including a driver's name, which is what a tool
 * mid-flow carries — is passed through as-is.
 */
function originOf(tool: CandidateTool): string {
  const location = tool.location.trim()
  return location === "" || location === NO_LOCATION ? DEFAULT_WAREHOUSE : location
}

/**
 * A claim beats a condition problem in the message, because it is the one the
 * warehouse manager can actually do something about — finish or cancel the
 * other trip.
 */
function blockFor(tool: CandidateTool, claim: { id: string; driver: string | null } | undefined): MovementBlock | null {
  if (claim) return { kind: "claimed", tripId: claim.id, driver: claim.driver }
  if (!isAssignable(tool.condition, tool.status)) {
    return { kind: "condition", detail: tool.condition || tool.status }
  }
  return null
}

/** Soonest first; a request with no date leads, matching every other list in the app. */
function byDue(a: RequestMovements, b: RequestMovements): number {
  return (a.start ?? "").localeCompare(b.start ?? "") || a.job.localeCompare(b.job) || a.requestId.localeCompare(b.requestId)
}
