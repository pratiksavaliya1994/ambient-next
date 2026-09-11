"use server"

import { revalidatePath } from "next/cache"

import { assignTools, listTakenToolIds, searchTools } from "@/lib/bubble/assigned-tools"
import type { CandidateTool } from "@/lib/bubble/assigned-tools-types"
import { getRequest } from "@/lib/bubble/requests"
import { requireSession } from "@/lib/auth/session"
import { assignToolsSchema } from "@/lib/schemas/assignment"
import type { CreateRequestState } from "@/app/(app)/requests/action-state"

/**
 * The extras pool, fetched only when the "Add extra tool" dialog asks for it.
 *
 * The assign screen preloads candidates for the *requested* types only; the
 * whole `tools` table behind them is not worth shipping to the browser, and
 * tools with a blank or dangling `type` are unreachable that way regardless.
 * This is the lazy half — one `name text contains` read per search.
 *
 * Read-only, but still behind `requireSession()`: a server action is reachable
 * by direct POST no matter what the page around it does.
 */
export async function searchToolsAction(query: string): Promise<CandidateTool[]> {
  await requireSession()
  return searchTools(query)
}

/**
 * Saves the whole assignment for one request — one call, because the
 * `create-assigned-tool` workflow owns both halves: it deletes and recreates
 * the `assignedtools` rows and sets `request.status = "Assigned"` itself.
 *
 * No tool's `statusNew` is touched. That needs the `update-request-status`
 * workflow, which isn't built yet — see the deferred note below the write.
 */
export async function assignToolsAction(input: unknown): Promise<CreateRequestState> {
  await requireSession()

  const parsed = assignToolsSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form")
      fieldErrors[key] ??= issue.message
    }
    return {
      status: "invalid",
      message: "That assignment isn't valid.",
      fieldErrors,
    }
  }

  const { requestId, assignments } = parsed.data

  const request = await getRequest(requestId)
  if (!request) {
    return { status: "error", message: "That request no longer exists in Bubble." }
  }

  // The availability check the screen rendered is minutes old by now. Bubble has
  // no transactions and no unique constraints, so re-running it immediately
  // before the write is the only defence there is — it narrows the double-assign
  // window to about a second. It does not close it.
  const taken = await listTakenToolIds(request)
  const conflicted = assignments.filter((entry) => taken.has(entry.toolId))
  if (conflicted.length > 0) {
    const conflict = taken.get(conflicted[0].toolId)!
    return {
      status: "error",
      message:
        conflicted.length === 1
          ? `That tool was just assigned to ${conflict.job}. Reload to see what's still free.`
          : `${conflicted.length} of these tools were just assigned to other requests. Reload to see what's still free.`,
    }
  }

  try {
    await assignTools(requestId, assignments)
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? `Bubble rejected the assignment: ${error.message}`
          : "Bubble rejected the assignment.",
    }
  }

  // Decided against, not deferred: assign/unassign never flip a tool's
  // `statusNew`. A tool can be legitimately assigned to a future request
  // while genuinely mid-flow on a different one (In Transit, Delivered
  // elsewhere, Pickup Requested), and writing `Assigned`/`Available` here
  // would clobber that real current state. `assignedtools` is the sole
  // record of the commitment, and it's already what `listTakenToolIds`
  // reads to prevent a double booking — `statusNew` doesn't need to carry
  // it too. This is also why `/tools` isn't revalidated below.

  revalidatePath("/requests")
  revalidatePath(`/requests/${requestId}`)
  revalidatePath(`/requests/${requestId}/assign`)

  return { status: "created", requestId, job: request.job }
}
