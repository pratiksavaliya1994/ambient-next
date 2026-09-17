/**
 * How far along a request is, and what `status` that makes it.
 *
 * Pure and client-safe on purpose: the trip builder shows a request's progress
 * in the browser while the server action writes the status, and the two must
 * not be able to disagree about what "done" means.
 *
 * This is the module that lets a request survive being split across trips. The
 * old model wrote `Delivered` across a whole request in one go, so a request
 * that sent three of its eight tools had nowhere to live.
 */

import { isPickupRequest, isWarehouseLocation, type RequestStatus } from "@/lib/bubble/enums"
import {
  TOOL_STATUS_AVAILABLE,
  TOOL_STATUS_DELIVERED,
  TOOL_STATUS_IN_TRANSIT,
  TOOL_STATUS_PICKUP_REQUESTED,
} from "@/lib/bubble/tool-enums"
import type { AssignedTool, CandidateTool } from "@/lib/bubble/assigned-tools-types"

export type RequestProgress = {
  /** Physical tools on `assignedtools` for this request. */
  assigned: number
  /** Of those, how many have reached their destination. See `hasLanded`. */
  landed: number
  /** Of those, how many are currently on a truck. */
  onTruck: number
  /**
   * Non-consumable requested slots still short of their quantity. From
   * `buildSlots`, so "fully assigned" has one definition app-wide.
   */
  unfilledSlots: number
  terminal: Extract<RequestStatus, "Delivered" | "Returned">
  partial: Extract<RequestStatus, "Partially Delivered" | "Partially Returned">
}

type ProgressRequest = {
  job: string
  delivery: boolean
  pickup: boolean
}

/**
 * The `statusNew` values that mean "a delivery put this tool down here".
 *
 * `Pickup Requested` counts, and that is the whole point of the list. Neither
 * of its writers moves the tool — a pickup request naming it at creation (3B),
 * or a driver reaching a collect stop and going without it — so a tool that was
 * delivered to a job and is now wanted back is still *standing on that job*.
 * Reading it as un-landed made a finished delivery leg look outstanding again,
 * which is exactly one bug wearing three faces:
 *
 * - the trip builder's pool re-listed the delivery alongside the pickup, with a
 *   `1407 Broadway → 1407 Broadway` movement for every tool, so the same tool
 *   appeared twice and its two rows shared one checkbox (selection is keyed by
 *   tool id, because a tool goes on a trip at most once);
 * - the group's "4 of 6 still to go" counted backwards as pickups were raised;
 * - `deriveRequestStatus` could never reach `Delivered`, because `landed` could
 *   never catch `assigned` again, and `classifyTool` painted the tools red as
 *   `not-ready`/`left-behind` on the dispatch board.
 *
 * `In Transit` is deliberately absent: that one *is* motion.
 */
const LANDED_DELIVERY_STATUS: readonly string[] = [TOOL_STATUS_DELIVERED, TOOL_STATUS_PICKUP_REQUESTED]

/**
 * Whether one assigned tool has reached where this request was sending it.
 *
 * Both halves are two-part tests, and both parts are load-bearing — a
 * status alone would count a tool that never moved:
 *
 * - **Delivery** — a `LANDED_DELIVERY_STATUS` value **and** sitting at this
 *   request's job. The status on its own could be a tool that landed on a
 *   *different* job; the location on its own could be a tool still in the yard
 *   of a warehouse that shares the job's name.
 * - **Pickup** — `Available` **and** at a warehouse. Unambiguous, because a
 *   pickup request flags every one of its tools `Pickup Requested` on a job
 *   site at creation (3B), so `Available` at the yard can only mean it came
 *   back.
 *
 * A pickup has a **second** way to land, and it is the site-to-site transfer:
 * a tool standing on some *other* site. What a pickup request asks for is that
 * the tool stop being on **this** site, and the ordinary way that happens
 * without a warehouse detour is that the same trip carries it straight to the
 * job that had already been assigned it — see `oneJourney` in
 * `lib/trips/movement-types.ts`, which collapses the two legs into one. The
 * tool ends `Delivered` somewhere else, the pickup is satisfied in the only
 * sense it ever meant, and without this the request could never close: its
 * tool would sit outstanding forever waiting for a yard it was never going to
 * see.
 *
 * Both parts are needed here too. `LANDED_DELIVERY_STATUS` rather than
 * `Delivered` alone, for exactly the reason that list exists — a pickup raised
 * at the *new* site must not un-land the tool and resurrect this request. A
 * known location rather than any, because a blank one is a data gap, and
 * reading a gap as "somewhere else" would close a request on no evidence.
 */
export function hasLanded(request: ProgressRequest, tool: CandidateTool): boolean {
  if (!isPickupRequest(request)) {
    return LANDED_DELIVERY_STATUS.includes(tool.status) && tool.location === request.job
  }
  if (tool.status === TOOL_STATUS_AVAILABLE && isWarehouseLocation(tool.location)) return true
  return (
    LANDED_DELIVERY_STATUS.includes(tool.status) &&
    tool.location.trim() !== "" &&
    tool.location !== request.job
  )
}

export function requestProgress(
  request: ProgressRequest,
  assignedRows: readonly AssignedTool[],
  toolsById: Map<string, CandidateTool>,
  unfilledSlots: number
): RequestProgress {
  const pickup = isPickupRequest(request)
  let landed = 0
  let onTruck = 0

  for (const row of assignedRows) {
    // An `assignedtools` row pointing at a deleted `tools` row can't be
    // classified, and counting it as outstanding forever would wedge the
    // request open. It drops out of both counts and out of `assigned`.
    const tool = toolsById.get(row.toolId)
    if (!tool) continue

    if (hasLanded(request, tool)) landed += 1
    else if (tool.status === TOOL_STATUS_IN_TRANSIT) onTruck += 1
  }

  return {
    assigned: assignedRows.filter((row) => toolsById.has(row.toolId)).length,
    landed,
    onTruck,
    unfilledSlots,
    terminal: pickup ? "Returned" : "Delivered",
    partial: pickup ? "Partially Returned" : "Partially Delivered",
  }
}

/**
 * The status a request should now read.
 *
 * **A ratchet: once closed, closed.** Assigning another tool to a finished
 * request must not silently reopen it, and that single rule is also what makes
 * the manual "Close request" escape hatch free — closing is nothing but writing
 * the terminal value, and this holds it there. Without the ratchet, closing a
 * request with a slot nobody will ever fill would be undone by the next
 * recompute.
 *
 * A request only closes on its own when **every assigned tool has landed and
 * every requested quantity is filled**. Landing five of five assigned tools
 * while three requested slots were never filled leaves it partial, because the
 * demand is real and unmet — that is the case the escape hatch exists for.
 */
export function deriveRequestStatus(progress: RequestProgress, current: RequestStatus): RequestStatus {
  if (current === "Delivered" || current === "Returned") return current
  if (progress.assigned === 0) return "New"
  if (progress.landed === progress.assigned && progress.unfilledSlots === 0) return progress.terminal
  if (progress.landed > 0) return progress.partial
  if (progress.onTruck > 0) return "In Transit"
  return "Assigned"
}
