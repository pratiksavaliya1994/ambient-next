"use server"

import { revalidatePath } from "next/cache"

import { isPickupRequest } from "@/lib/bubble/enums"
import { TOOL_STATUS_IN_TRANSIT } from "@/lib/bubble/tool-enums"
import { setRequestStatuses } from "@/lib/bubble/request-status"
import { closeRequestSchema } from "@/lib/schemas/trip"
import type { CloseRequestState } from "@/app/(app)/requests/[requestId]/action-state"

import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { clearRequestOrder } from "@/lib/bubble/request-order"
import { getRequest, offloadRequest } from "@/lib/bubble/requests"
import { listTripFlags } from "@/lib/bubble/triptool-read"
import { requireSession } from "@/lib/auth/session"
import { deriveTripStatus } from "@/lib/dispatch/tool-state"
import { offloadSchema } from "@/lib/schemas/assignment"
import type { OffloadState } from "@/app/(app)/requests/[requestId]/action-state"

/**
 * Drops the load: one call to `update-request-status` (`offloadRequest`),
 * the same "build the screen before the write" order 2B's dispatch action
 * followed.
 */
export async function offloadAction(input: unknown): Promise<OffloadState> {
  await requireSession()

  const parsed = offloadSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "error", message: "That offload isn't valid." }
  }

  const { requestId } = parsed.data

  const request = await getRequest(requestId)
  if (!request) {
    return { status: "error", message: "That request no longer exists in Bubble." }
  }

  // The screen's status is however old the page render is. Re-check right
  // before writing — the same narrowed-not-closed defence `dispatchAction`
  // gives the dispatch board — so offloading a request someone else already
  // moved fails loudly instead of silently re-offloading it.
  if (request.status !== "In Transit") {
    return { status: "error", message: `This request is already ${request.status}. Reload the page.` }
  }

  const assigned = await listAssignedTools([requestId])
  const toolIds = [...new Set(assigned.map((entry) => entry.toolId))]

  // The dialog's own trigger is already disabled for this case
  // (`CompleteDeliveryAction`) — this is the authoritative re-check right
  // before the write, since a server action is reachable by direct POST. A
  // tool still sitting off-site hasn't reached the driver yet, so it can't
  // truthfully be marked `Delivered`.
  const [tools, flagsByRequest] = await Promise.all([listToolsByIds(toolIds), listTripFlags(toolIds)])
  const toolsById = new Map(tools.map((tool) => [tool.id, tool]))
  const { pickupStops, undeliverable } = deriveTripStatus(
    request,
    assigned,
    toolsById,
    flagsByRequest.get(requestId)
  )
  if (pickupStops.length > 0) {
    return {
      status: "error",
      message:
        pickupStops.length === 1
          ? `A tool still needs picking up from ${pickupStops[0].location} before this can be delivered.`
          : `${pickupStops.length} sites still need picking up before this can be delivered.`,
    }
  }

  // Only what can truthfully land gets written `Delivered` at the job. A tool
  // the driver marked "Not picked up" (`leaveBehindAction`) never reached them,
  // so it keeps the `Pickup Requested` and job-site `location` Bubble already
  // holds; a tool the site **refused** did reach them and was turned away, so it
  // is riding back to the yard or already there. Either way the drop did not
  // happen — the same reason the guard above exists, applied to a stop that was
  // answered rather than one still outstanding.
  const undeliverableIds = new Set(undeliverable)
  const deliverableIds = toolIds.filter((toolId) => !undeliverableIds.has(toolId))

  // A request with no tools at all is legitimate (materials only); a request
  // whose every tool was left behind or refused has nothing to deliver, so
  // completing it would record a drop that didn't happen.
  if (toolIds.length > 0 && deliverableIds.length === 0) {
    return {
      status: "error",
      message: "None of this request's tools reached the job — there's nothing to deliver.",
    }
  }

  let toolsUpdated: number
  try {
    ;({ toolsUpdated } = await offloadRequest(requestId, deliverableIds, request.job))
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? `Bubble rejected the offload: ${error.message}` : "Bubble rejected the offload.",
    }
  }

  // The trip is over, so this request's place on it is meaningless. Clearing it
  // is what stops a stale position riding along if the request is ever
  // dispatched again — under a different driver, on a route where `3` means
  // something else. Deliberately not fatal and deliberately not part of the
  // offload write: the delivery is complete either way, and a leftover `order`
  // only affects where a hypothetical future trip would sort it.
  try {
    await clearRequestOrder(requestId)
  } catch {
    // Nothing to tell the driver — the delivery landed.
  }

  revalidatePath("/dispatch/active")
  revalidatePath("/requests")
  revalidatePath(`/requests/${requestId}`)

  const warning =
    toolsUpdated !== deliverableIds.length
      ? `${toolsUpdated} of ${deliverableIds.length} tools updated — check Bubble for the rest.`
      : undefined

  return { status: "delivered", warning }
}

/**
 * Closes a request by hand — the escape hatch for requested slots nobody will
 * ever fill.
 *
 * A request closes on its own only when every assigned tool has landed **and**
 * every requested quantity is filled (`deriveRequestStatus`). A job that asked
 * for four grinders, got three, and is finished with them would otherwise sit
 * at `Partially Delivered` forever — real unmet demand nobody is going to meet.
 *
 * All this writes is the terminal status: it moves no tools, because there is
 * nothing left to move. And nothing reopens the request afterwards —
 * `deriveRequestStatus` treats the terminal values as a ratchet, which is
 * exactly what makes this one write enough.
 */
export async function closeRequestAction(input: unknown): Promise<CloseRequestState> {
  await requireSession()

  const parsed = closeRequestSchema.safeParse(input)
  if (!parsed.success) return { status: "error", message: "That isn't a valid request." }

  const { requestId } = parsed.data
  const request = await getRequest(requestId)
  if (!request) return { status: "error", message: "That request no longer exists in Bubble." }
  if (request.status === "Delivered" || request.status === "Returned") {
    return { status: "error", message: `This request is already ${request.status}.` }
  }

  // Refuse while anything is still moving. Closing a request whose tools are on
  // a truck would mark it finished while the driver is still carrying its load
  // — and the ratchet means re-deriving could not walk that back.
  const assigned = await listAssignedTools([requestId])
  const inTransit = (await listToolsByIds(assigned.map((row) => row.toolId))).filter(
    (tool) => tool.status === TOOL_STATUS_IN_TRANSIT
  )
  if (inTransit.length > 0) {
    return {
      status: "error",
      message: `${inTransit.length} of this request's tools ${inTransit.length === 1 ? "is" : "are"} still on a trip. Finish the trip first.`,
    }
  }

  const terminal = isPickupRequest(request) ? "Returned" : "Delivered"

  try {
    await setRequestStatuses([requestId], terminal)
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the change: ${error.message}` : "Bubble rejected the change.",
    }
  }

  revalidatePath("/requests")
  revalidatePath(`/requests/${requestId}`)
  revalidatePath("/trips/new")

  return { status: "closed", requestStatus: terminal }
}
