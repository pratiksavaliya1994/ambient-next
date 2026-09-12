"use server"

import { revalidatePath } from "next/cache"

import { listToolsByIds } from "@/lib/bubble/assigned-tools"
import { isReadyForDispatch } from "@/lib/bubble/enums"
import { dispatchRequests, getRequest } from "@/lib/bubble/requests"
import { requireSession } from "@/lib/auth/session"
import { confirmPickupSchema } from "@/lib/schemas/assignment"
import type { PickupState } from "@/app/(app)/dispatch/active/action-state"

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
