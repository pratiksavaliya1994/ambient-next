"use server"

import { revalidatePath } from "next/cache"

import { listAssignedTools } from "@/lib/bubble/assigned-tools"
import { getRequest, offloadRequest } from "@/lib/bubble/requests"
import { requireSession } from "@/lib/auth/session"
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

  let toolsUpdated: number
  try {
    ;({ toolsUpdated } = await offloadRequest(requestId, toolIds, request.job))
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
    toolsUpdated !== toolIds.length
      ? `${toolsUpdated} of ${toolIds.length} tools updated — check Bubble for the rest.`
      : undefined

  return { status: "delivered", warning }
}
