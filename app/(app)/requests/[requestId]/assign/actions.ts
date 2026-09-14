"use server"

import { revalidatePath } from "next/cache"

import { assignTools, listAssignedTools, listToolsByIds, searchTools } from "@/lib/bubble/assigned-tools"
import type { CandidateTool } from "@/lib/bubble/assigned-tools-types"
import { isFreeToAssign } from "@/lib/bubble/enums"
import { getRequest, markToolsAssigned, releaseToolsToAvailable } from "@/lib/bubble/requests"
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
 * Saves the whole assignment for one request — two Bubble calls, not one.
 * `create-assigned-tool` deletes and recreates the `assignedtools` rows and
 * sets `request.status = "Assigned"`; right after it succeeds, a second call
 * flips `tools.statusNew` for whichever ids actually changed hands. See the
 * reversal note on `TOOL_STATUS_NEW` in `lib/bubble/enums.ts` for why this
 * exists now, having been deliberately dropped in phase 2A.
 *
 * Assign is always a wholesale replace (`assignTools`'s own doc comment), so
 * the status half has to be a **diff** against what the request held before
 * this save: newly-added ids are freshly committed (`markToolsAssigned`),
 * dropped ids are freed (`releaseToolsToAvailable`). Ids present both before
 * and after need no write — they're already `Assigned`.
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

  const previousToolIds = new Set((await listAssignedTools([requestId])).map((entry) => entry.toolId))
  const submittedToolIds = new Set(assignments.map((entry) => entry.toolId))
  const added = [...submittedToolIds].filter((id) => !previousToolIds.has(id))
  const removed = [...previousToolIds].filter((id) => !submittedToolIds.has(id))

  // The screen's candidate list is however old the page render is. Re-check
  // every genuinely *new* pick's live status immediately before the write —
  // Bubble has no transactions and no unique constraints, so this narrows the
  // double-assign window to about a second. It does not close it. A tool
  // already on this request needs no re-check: keeping it picked and saving
  // again is not a new claim.
  if (added.length > 0) {
    const live = await listToolsByIds(added)
    const taken = live.filter((tool) => !isFreeToAssign(tool.status))
    if (taken.length > 0) {
      return {
        status: "error",
        message:
          taken.length === 1
            ? `${taken[0].name} was just claimed elsewhere. Reload to see what's still free.`
            : `${taken.length} of these tools were just claimed elsewhere. Reload to see what's still free.`,
      }
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

  // The `assignedtools` rows are committed from here on regardless of what
  // follows — a problem below is a tool-status write to retry, not a failed
  // assignment, so it becomes a warning rather than an error.
  const warnings: string[] = []
  try {
    if (added.length > 0) {
      const { toolsUpdated } = await markToolsAssigned(requestId, added)
      if (toolsUpdated !== added.length) {
        warnings.push(`${toolsUpdated} of ${added.length} newly assigned tools updated`)
      }
    }
    if (removed.length > 0) {
      const { toolsUpdated } = await releaseToolsToAvailable(requestId, removed)
      if (toolsUpdated !== removed.length) {
        warnings.push(`${toolsUpdated} of ${removed.length} released tools updated`)
      }
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "some tool statuses didn't update")
  }

  revalidatePath("/requests")
  revalidatePath(`/requests/${requestId}`)
  revalidatePath(`/requests/${requestId}/assign`)
  revalidatePath("/dispatch")
  revalidatePath("/dispatch/active")

  return {
    status: "created",
    requestId,
    job: request.job,
    warning: warnings.length > 0 ? `${warnings.join("; ")} — check Bubble for the rest.` : undefined,
  }
}
