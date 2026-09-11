"use server"

import { revalidatePath } from "next/cache"

import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { isReadyForDispatch } from "@/lib/bubble/enums"
import { dispatchRequests, getRequest } from "@/lib/bubble/requests"
import { requireSession } from "@/lib/auth/session"
import { dispatchSchema } from "@/lib/schemas/assignment"
import type { DispatchState } from "@/app/(app)/dispatch/action-state"

/**
 * Sends the selected `Assigned` requests out with a driver — one call to the
 * `update-request-status` Bubble workflow (`dispatchRequests`), the same
 * "build the screen before the write" order 2A's assign action followed.
 *
 * Not built in Bubble yet (`docs/bubble-request-status-workflow.md` §6), so
 * until it exists this will reach `dispatchRequests` and fail there with a
 * Bubble-rejected error rather than the button silently doing nothing.
 */
export async function dispatchAction(input: unknown): Promise<DispatchState> {
  await requireSession()

  const parsed = dispatchSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form")
      fieldErrors[key] ??= issue.message
    }
    return { status: "invalid", message: "That dispatch isn't valid.", fieldErrors }
  }

  const { requestIds, driver } = parsed.data

  // The board's list is however old the page render is. Re-check every
  // selected request is still `Assigned` immediately before writing — the
  // same narrowed-not-closed defence `listTakenToolIds` gives the assign
  // screen — so dispatching a request someone else already moved fails loudly
  // instead of silently re-dispatching it.
  const requests = await Promise.all(requestIds.map((id) => getRequest(id)))
  const stale = requests.filter((request) => !request || request.status !== "Assigned")
  if (stale.length > 0) {
    return {
      status: "error",
      message:
        stale.length === 1
          ? "One of the selected requests is no longer Assigned. Reload the board."
          : `${stale.length} of the selected requests are no longer Assigned. Reload the board.`,
    }
  }

  const assigned = await listAssignedTools(requestIds)
  const toolIds = [...new Set(assigned.map((entry) => entry.toolId))]

  // The board's disabled checkboxes are the primary defence, but that render
  // can be a little stale by the time this fires — re-check each tool's live
  // `statusNew` immediately before the write, the same "narrow, not close"
  // defence `listTakenToolIds` gives the assign screen.
  const notReady = (await listToolsByIds(toolIds)).filter((tool) => !isReadyForDispatch(tool.status))
  if (notReady.length > 0) {
    const [first] = notReady
    return {
      status: "error",
      message:
        notReady.length === 1
          ? `One of the selected requests has a tool that isn't available right now (${first.name} is ${first.status} at ${first.location}). Reload the board.`
          : `${notReady.length} of the selected requests have tools that aren't available right now. Reload the board.`,
    }
  }

  let toolsUpdated: number
  try {
    ;({ toolsUpdated } = await dispatchRequests(requestIds, driver, toolIds))
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? `Bubble rejected the dispatch: ${error.message}` : "Bubble rejected the dispatch.",
    }
  }

  revalidatePath("/dispatch")
  revalidatePath("/dispatch/active")
  revalidatePath("/requests")
  for (const id of requestIds) revalidatePath(`/requests/${id}`)

  const warning =
    toolsUpdated !== toolIds.length
      ? `${toolsUpdated} of ${toolIds.length} tools updated — check Bubble for the rest.`
      : undefined

  return { status: "dispatched", count: requestIds.length, warning }
}
