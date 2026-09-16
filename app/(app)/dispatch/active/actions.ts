"use server"

import { revalidatePath } from "next/cache"

import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { isWarehouseLocation } from "@/lib/bubble/enums"
import { isReadyForDispatch } from "@/lib/bubble/tool-enums"
import { setRequestOrder } from "@/lib/bubble/request-order"
import { dispatchRequests, getRequest, leaveToolsBehind, listRequestsByStatus } from "@/lib/bubble/requests"
import { requireSession } from "@/lib/auth/session"
import { toStopOrders } from "@/lib/dispatch/stop-order"
import { confirmPickupSchema, leaveBehindSchema, setStopOrderSchema } from "@/lib/schemas/assignment"
import type { PickupState, StopOrderState } from "@/app/(app)/dispatch/active/action-state"

/**
 * Confirms a driver has physically collected one off-site pickup stop's
 * tools — the manual half of a site-to-site transfer. Dispatch
 * (`app/(app)/dispatch/actions.ts#dispatchAction`) deliberately leaves an
 * off-site tool `Available` at its own job site rather than moving it to
 * `In Transit` sight unseen; this is what actually moves it, once the driver
 * says so.
 *
 * Reuses `dispatchRequests` itself rather than a separate write path: moving
 * a request that's already `In Transit` to `In Transit` again is a no-op, and
 * scoping `toolIds` to just this one stop is what makes the write land on
 * only those tools.
 */
export async function confirmPickupAction(input: unknown): Promise<PickupState> {
  await requireSession()

  const parsed = confirmPickupSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "error", message: "That pickup isn't valid." }
  }
  const { requestId, toolIds } = parsed.data

  const request = await getRequest(requestId)
  if (!request) {
    return { status: "error", message: "That request no longer exists in Bubble." }
  }
  if (request.status !== "In Transit" || !request.driver) {
    return { status: "error", message: "This request isn't an active trip. Reload the page." }
  }

  // The card's list is however old the page render is — re-check each tool's
  // live `statusNew` immediately before the write, the same "narrow, not
  // close" defence `dispatchAction` gives.
  const notReady = (await listToolsByIds(toolIds)).filter((tool) => !isReadyForDispatch(tool.status))
  if (notReady.length > 0) {
    const [first] = notReady
    return {
      status: "error",
      message: `${first.name} isn't available to pick up anymore (it's ${first.status}). Reload the page.`,
    }
  }

  let toolsUpdated: number
  try {
    ;({ toolsUpdated } = await dispatchRequests([requestId], request.driver, toolIds))
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the pickup: ${error.message}` : "Bubble rejected the pickup.",
    }
  }

  revalidatePath("/dispatch/active")
  revalidatePath("/requests")
  revalidatePath(`/requests/${requestId}`)

  const warning =
    toolsUpdated !== toolIds.length
      ? `${toolsUpdated} of ${toolIds.length} tools updated — check Bubble for the rest.`
      : undefined

  return { status: "picked-up", warning }
}

/**
 * The other answer at the same stop: the driver got there and the tool wasn't
 * takeable — still in use, buried, gone. Without this a single uncollectable
 * tool strands the whole request, since `offloadAction` refuses to mark a
 * delivery complete while any assigned tool is still sitting off-site.
 *
 * Writes `statusNew: "Pickup Requested"` and nothing else (`leaveToolsBehind`),
 * so the tool keeps the job `location` it was never collected from. That is
 * what drops it out of `pickupStops` — releasing the delivery — while keeping
 * it on the request, flagged, rather than quietly unassigning it.
 *
 * Final by design: there is no undo action, matching `confirmPickupAction`.
 * The button behind this opens a confirmation dialog for that reason.
 */
export async function leaveBehindAction(input: unknown): Promise<PickupState> {
  await requireSession()

  const parsed = leaveBehindSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "error", message: "That isn't a valid tool to leave behind." }
  }
  const { requestId, toolIds } = parsed.data

  const request = await getRequest(requestId)
  if (!request) {
    return { status: "error", message: "That request no longer exists in Bubble." }
  }
  if (request.status !== "In Transit" || !request.driver) {
    return { status: "error", message: "This request isn't an active trip. Reload the page." }
  }

  // Stricter than the pickup confirm, because this writes a status to a tool
  // rather than moving one the request already owns: an id that isn't actually
  // on this request is never taken on trust.
  const assignedIds = new Set((await listAssignedTools([requestId])).map((row) => row.toolId))
  if (toolIds.some((toolId) => !assignedIds.has(toolId))) {
    return { status: "error", message: "That tool isn't assigned to this request. Reload the page." }
  }

  // Re-check live state immediately before the write, the same "narrow, not
  // close" defence `confirmPickupAction` gives — only a tool genuinely still
  // waiting at its own site can be left behind, never one already on the truck.
  const tools = await listToolsByIds(toolIds)
  const notWaiting = tools.filter((tool) => !isReadyForDispatch(tool.status) || isWarehouseLocation(tool.location))
  if (notWaiting.length > 0) {
    const [first] = notWaiting
    return {
      status: "error",
      message: `${first.name} isn't waiting to be picked up anymore (it's ${first.status} at ${first.location}). Reload the page.`,
    }
  }

  let toolsUpdated: number
  try {
    ;({ toolsUpdated } = await leaveToolsBehind(requestId, toolIds))
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? `Bubble rejected the change: ${error.message}`
          : "Bubble rejected the change.",
    }
  }

  revalidatePath("/dispatch/active")
  revalidatePath("/requests")
  revalidatePath(`/requests/${requestId}`)

  const warning =
    toolsUpdated !== toolIds.length
      ? `${toolsUpdated} of ${toolIds.length} tools updated — check Bubble for the rest.`
      : undefined

  return { status: "left-behind", warning }
}

/**
 * Saves the order a dispatcher dragged a driver's stops into — one write for
 * the whole route, never one per drag. The card holds the new arrangement in
 * local state until Save, the same shape `components/assign-tools-panel.tsx`
 * uses for assignments.
 *
 * Writes `request.order` and nothing else, through its own workflow rather
 * than `update-request-status`; see `lib/bubble/request-order.ts` for why.
 */
export async function setStopOrderAction(input: unknown): Promise<StopOrderState> {
  await requireSession()

  const parsed = setStopOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "error", message: "That stop order isn't valid." }
  }
  const { driver, requestIds } = parsed.data

  // The card is however old the page render is. Re-read the whole trip — the
  // same "narrow, not close" defence the two actions above give their writes —
  // and refuse anything but an exact match: renumbering 1..N over a set that
  // has since gained or lost a stop would save a route nobody ever saw.
  const live = await listRequestsByStatus("In Transit", driver)
  const liveIds = new Set(live.map((request) => request.id))
  if (live.length !== requestIds.length || requestIds.some((id) => !liveIds.has(id))) {
    return {
      status: "error",
      message: `${driver}'s trip now has ${live.length} ${live.length === 1 ? "stop" : "stops"}. Reload the page and set the order again.`,
    }
  }

  try {
    await setRequestOrder(toStopOrders(requestIds))
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? `Bubble rejected the new order: ${error.message}` : "Bubble rejected the new order.",
    }
  }

  // Not `/requests` or `/requests/{id}` — neither reads `order`.
  revalidatePath("/dispatch/active")
  revalidatePath("/dispatch")

  return { status: "ordered", count: requestIds.length }
}
