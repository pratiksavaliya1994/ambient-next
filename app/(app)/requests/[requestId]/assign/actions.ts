"use server"

import { revalidatePath } from "next/cache"

import {
  assignTools,
  listAssignedTools,
  listRequestClaims,
  listToolsByIds,
  searchTools,
} from "@/lib/bubble/assigned-tools"
import type { CandidateTool, ToolRequestClaim } from "@/lib/bubble/assigned-tools-types"
import { isFreeToAssign, isLockedToTrip, TOOL_STATUS_ASSIGNED } from "@/lib/bubble/tool-enums"
import type { RequestStatus } from "@/lib/bubble/enums"
import { getRequest, markToolsAssigned, releaseToolsToAvailable } from "@/lib/bubble/requests"
import { listToolClaims } from "@/lib/bubble/trips-read"
import { requireSession } from "@/lib/auth/session"
import { assignToolsSchema } from "@/lib/schemas/assignment"
import type { CreateRequestState } from "@/app/(app)/requests/action-state"

/** The inverse of `isLockedToTrip`, and narrower: only an untouched commitment goes back to `Available`. */
function isReleasable(tool: CandidateTool): boolean {
  return tool.status === TOOL_STATUS_ASSIGNED
}

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
 *
 * Returns the "already on another request" warnings alongside the rows. The
 * page resolves those for the *preloaded* candidates, but these are fetched
 * after it rendered, so they would otherwise be the one route into the picker
 * with no warning on it — and the extras dialog searches the whole `tools`
 * table, which is exactly where an unexpected claim is most likely.
 */
export async function searchToolsAction(
  query: string,
  requestId: string
): Promise<{ tools: CandidateTool[]; claims: ToolRequestClaim[] }> {
  await requireSession()

  const tools = await searchTools(query)
  const claims = await listRequestClaims(
    tools.map((tool) => tool.id),
    requestId
  )
  return { tools, claims: [...claims.values()] }
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
 *
 * The *request's* own status is put back by the same pair. Assigning stays open
 * for the whole life of a request — a load that went out short gets its missing
 * tools filled in days later, which was the whole point of the partial statuses
 * — but `create-assigned-tool` writes `request.status = "Assigned"`
 * unconditionally, which would march an `In Transit` or `Partially Delivered`
 * request backwards to a step it has already passed. See `statusAfterSave`.
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

  // A tool that has already left on a trip is not this screen's to give back.
  //
  // `create-assigned-tool` is a **wholesale replace**, so a save that omits an
  // already-dispatched tool doesn't just fail to release it — it deletes the
  // `assignedtools` row that was the only record of what went out. One stale
  // render is enough to do it. Refuse the whole save rather than silently
  // dropping the row, and name the tool so the fix is obvious.
  //
  // Server-side because a server action is reachable by direct POST; the assign
  // panel hides the remove control too, so this should be unreachable in the UI.
  const removedTools = removed.length > 0 ? await listToolsByIds(removed) : []
  const lockedTools = removedTools.filter((tool) => isLockedToTrip(tool.status))
  if (lockedTools.length > 0) {
    const [first] = lockedTools
    return {
      status: "error",
      message:
        lockedTools.length === 1
          ? `${first.name} is already ${first.status.toLowerCase()} and can't be removed here. Reload the page.`
          : `${lockedTools.length} of these tools are already out on a trip and can't be removed here. Reload the page.`,
    }
  }

  // The same refusal, for the tools a trip is only *about* to take — and
  // `statusNew` cannot answer this one. `start-trip` moves nothing, so a tool
  // planned onto a saved trip still reads `Assigned` until the driver records
  // the collect, and `isLockedToTrip` above lets it straight through. The
  // `triptool` row is the only thing that knows.
  //
  // Letting it through deletes the `assignedtools` row and flips the tool back
  // to `Available` while the trip still lists it: the driver turns up for a tool
  // the request no longer has, the run sheet names a tool nobody assigned, and
  // the claim keeps that tool off every other trip with nothing on screen
  // explaining why. Same claim query the trip builder and `startTripAction` run.
  const claims = removed.length > 0 ? await listToolClaims(removed) : null
  if (claims && claims.size > 0) {
    const [toolId, trip] = [...claims][0]
    const name = removedTools.find((tool) => tool.id === toolId)?.name ?? "A tool"
    return {
      status: "error",
      message:
        claims.size === 1
          ? `${name} is on ${trip.driver ?? "another"}'s trip and can't be removed here. Take it off that trip first.`
          : `${claims.size} of these tools are on a saved trip and can't be removed here. Take them off that trip first.`,
    }
  }

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

  // Where the request should be left standing. `create-assigned-tool` has just
  // stamped `Assigned` over whatever it held, so this is a repair, not a
  // transition: a request already out on the road stays where it was, and only
  // a `New` one actually advances. Both terminal values are included
  // deliberately — a tool added to a closed request must not reopen it, the
  // same ratchet `deriveRequestStatus` holds.
  const statusAfterSave: RequestStatus = request.status === "New" ? "Assigned" : request.status
  const restoresStatus = statusAfterSave !== "Assigned"

  // The `assignedtools` rows are committed from here on regardless of what
  // follows — a problem below is a tool-status write to retry, not a failed
  // assignment, so it becomes a warning rather than an error.
  const warnings: string[] = []
  try {
    // `toolIds` may be empty: with nothing added to a request that needs its
    // status put back, this call is the status write and nothing else.
    if (added.length > 0 || restoresStatus) {
      const { toolsUpdated } = await markToolsAssigned(requestId, added, statusAfterSave)
      if (toolsUpdated !== added.length) {
        warnings.push(`${toolsUpdated} of ${added.length} newly assigned tools updated`)
      }
    }
    // Belt and braces against the guard above: only a tool still reading
    // `Assigned` is ever written back to `Available`. Anything else — a
    // condition value, or a state the guard somehow let through — is left
    // exactly as it is. Writing `Available` over a tool that is physically
    // sitting on a job site is the failure mode this whole pair exists to stop.
    //
    // Reuses the guard's own read rather than re-fetching: nothing between here
    // and there writes a *removed* tool's `statusNew` — `markToolsAssigned`
    // touches only `added` — so a second read would return the same rows.
    const releasable = removedTools.filter(isReleasable)
    if (releasable.length > 0) {
      const { toolsUpdated } = await releaseToolsToAvailable(
        requestId,
        releasable.map((tool) => tool.id),
        statusAfterSave
      )
      if (toolsUpdated !== releasable.length) {
        warnings.push(`${toolsUpdated} of ${releasable.length} released tools updated`)
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
