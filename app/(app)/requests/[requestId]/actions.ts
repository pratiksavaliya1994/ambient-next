"use server"

import { revalidatePath } from "next/cache"

import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { getRequest, offloadRequest } from "@/lib/bubble/requests"
import { requireSession } from "@/lib/auth/session"
import { deriveTripStatus } from "@/lib/dispatch/summary"
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
  const toolsById = new Map((await listToolsByIds(toolIds)).map((tool) => [tool.id, tool]))
  const { pickupStops, leftBehind } = deriveTripStatus(request, assigned, toolsById)
  if (pickupStops.length > 0) {
    return {
      status: "error",
      message:
        pickupStops.length === 1
          ? `A tool still needs picking up from ${pickupStops[0].location} before this can be delivered.`
          : `${pickupStops.length} sites still need picking up before this can be delivered.`,
    }
  }

  // Only what's actually on the truck gets written `Delivered` at the job. A
  // tool the driver marked "Not picked up" (`leaveBehindAction`) never reached
  // them, so it keeps the `Pickup Requested` and job-site `location` Bubble
  // already holds — the same reason the guard above exists, applied to a stop
  // that was answered rather than one still outstanding.
  const leftBehindIds = new Set(leftBehind)
  const deliverableIds = toolIds.filter((toolId) => !leftBehindIds.has(toolId))

  // A request with no tools at all is legitimate (materials only); a request
  // whose every tool was left behind has nothing to deliver, so completing it
  // would record a drop that didn't happen.
  if (toolIds.length > 0 && deliverableIds.length === 0) {
    return {
      status: "error",
      message: "None of this request's tools were collected — there's nothing to deliver.",
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

  revalidatePath("/dispatch/active")
  revalidatePath("/requests")
  revalidatePath(`/requests/${requestId}`)

  const warning =
    toolsUpdated !== deliverableIds.length
      ? `${toolsUpdated} of ${deliverableIds.length} tools updated — check Bubble for the rest.`
      : undefined

  return { status: "delivered", warning }
}
