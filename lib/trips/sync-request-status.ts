import "server-only"

import { listAssignedTools, listOpenRequestIdsForTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { buildSlots } from "@/lib/bubble/assigned-tools-types"
import type { RequestStatus } from "@/lib/bubble/enums"
import { listToolTypes } from "@/lib/bubble/reference"
import { getRequest } from "@/lib/bubble/requests"
import { setRequestStatuses } from "@/lib/bubble/request-status"
import { deriveRequestStatus, requestProgress } from "@/lib/trips/request-progress"

/**
 * Recomputes `request.status` for every request a trip write just touched, and
 * writes back only what actually changed.
 *
 * Called **after** the tool writes have committed, never before — the whole
 * derivation reads live `tools` rows, so running it first would compute the
 * status the request had a moment ago.
 *
 * Grouping by target status is what keeps this cheap and honest: one
 * `update-request-status` call per *distinct* status, and one status across N
 * requests is exactly that workflow's synchronous list-change contract, so
 * every call returns a count worth checking. At most five calls; in practice
 * one or two.
 *
 * **Non-fatal by design.** The tools have already moved by the time this runs,
 * so a failure here is a status to re-derive, not a movement to undo. Callers
 * surface it as a warning and let the action succeed — the same call
 * `assignToolsAction` makes about its own follow-up write.
 *
 * `touchedToolIds` widens the set beyond the requests the caller named, and a
 * trip always passes it. The reason is the **site-to-site transfer**: one
 * `triptool` row carries one `requestId`, and a tool moving straight from the
 * site that wanted it collected to the job that wanted it delivered has both
 * legs collapsed into a single row under the *delivery* (see `oneJourney` in
 * `lib/trips/movement-types.ts`). The pickup request is satisfied by that same
 * drive — `hasLanded` says so — but it is named nowhere on the trip, so
 * without this it would keep reading `Assigned` until something unrelated
 * happened to recompute it. One extra `assignedtools` query answers it from
 * live data, which beats persisting a second request id the schema has no
 * field for.
 */
export async function syncRequestStatuses(
  requestIds: readonly string[],
  driver?: string,
  touchedToolIds: readonly string[] = []
): Promise<{ updated: number; warning?: string }> {
  try {
    const ids = [
      ...new Set([...requestIds, ...(await listOpenRequestIdsForTools([...new Set(touchedToolIds)]))].filter(Boolean)),
    ]
    if (ids.length === 0) return { updated: 0 }

    const [requests, assignedRows, toolTypes] = await Promise.all([
      Promise.all(ids.map((id) => getRequest(id))),
      listAssignedTools(ids),
      listToolTypes(),
    ])

    const toolsById = new Map(
      (await listToolsByIds([...new Set(assignedRows.map((row) => row.toolId))])).map((tool) => [tool.id, tool])
    )

    const byStatus = new Map<RequestStatus, string[]>()

    for (const request of requests) {
      if (!request) continue

      const rows = assignedRows.filter((row) => row.requestId === request.id)
      const { slots } = buildSlots(request.tools, rows, toolTypes)
      const unfilledSlots = slots.filter((slot) => !slot.consumable && slot.toolIds.length < slot.requested).length

      const next = deriveRequestStatus(requestProgress(request, rows, toolsById, unfilledSlots), request.status)
      // A no-op write is still a real Bubble round trip, and there are usually
      // more unchanged requests than changed ones.
      if (next === request.status) continue

      byStatus.set(next, [...(byStatus.get(next) ?? []), request.id])
    }

    let updated = 0
    for (const [status, group] of byStatus) {
      await setRequestStatuses(group, status, driver)
      updated += group.length
    }

    return { updated }
  } catch (error) {
    return {
      updated: 0,
      warning:
        error instanceof Error
          ? `Tools moved, but request statuses didn't update: ${error.message}`
          : "Tools moved, but request statuses didn't update.",
    }
  }
}
