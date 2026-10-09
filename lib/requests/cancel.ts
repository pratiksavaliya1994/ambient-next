import { newYorkStamp } from "@/lib/bubble/dates"
import { isPickupRequest, isWarehouseLocation, type RequestStatus } from "@/lib/bubble/enums"
import type { CandidateTool } from "@/lib/bubble/assigned-tools-types"
import { isLive } from "@/lib/bubble/requested-materials-types"
import type { LineTripRow } from "@/lib/bubble/trip-materials-types"
import type { Trip } from "@/lib/bubble/trips-types"
import {
  TOOL_STATUS_ASSIGNED,
  TOOL_STATUS_AVAILABLE,
  TOOL_STATUS_DELIVERED,
  TOOL_STATUS_PICKUP_REQUESTED,
  type ToolStatusNew,
} from "@/lib/bubble/tool-enums"

/**
 * Cancel request's rules — pure and client-safe, so the detail page (which
 * hides the button) and `cancelRequestAction` (which refuses a direct POST)
 * can't disagree. See `docs/cancel-request.md`.
 */

/** Up to the assign step. Anything past it has moved, and Close is the way out. */
export const CANCELLABLE_STATUSES: readonly RequestStatus[] = ["New", "Assigned"]

export function isCancellable(status: RequestStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status)
}

export type CancelBlockInput = {
  status: RequestStatus
  /** `listToolClaims` over the request's assigned tools — open trips only. */
  toolClaims: ReadonlyMap<string, Pick<Trip, "driver">>
  /** The request's own material lines' trip rows, with `tripStatus`. */
  lineRows: readonly LineTripRow[]
  /** A delivery's linked pickup lines' trip rows (transfers feeding it). */
  linkedRows: readonly LineTripRow[]
}

/**
 * Why this request can't be cancelled, or `null`.
 *
 * "On a trip" is read off the trip rows, never `statusNew`: a tool planned onto
 * a draft — or a started trip whose driver hasn't reached it — still reads
 * `Assigned`, and cancelling would leave the trip carrying a tool nobody wants.
 */
export function cancelBlockReason({ status, toolClaims, lineRows, linkedRows }: CancelBlockInput): string | null {
  if (!isCancellable(status)) return `This request is already ${status}, so it can't be cancelled.`

  if (toolClaims.size > 0) {
    const [trip] = [...toolClaims.values()]
    return toolClaims.size === 1
      ? `One of its tools is on ${trip.driver ?? "a"}'s trip. Take it off that trip first.`
      : `${toolClaims.size} of its tools are on a trip. Take them off the trip first.`
  }
  if (lineRows.some(isLive)) return "Some of its materials are on a trip. Take them off the trip first."
  if (linkedRows.some(isLive)) {
    return "Materials being transferred to it from another site are on a trip. Take them off the trip first."
  }
  return null
}

/** Another open request holding the same tool — only its direction matters here. */
export type ToolHolder = { delivery: boolean; pickup: boolean }

/**
 * The `statusNew` each of a cancelled request's tools goes back to, grouped
 * so each target is one `update-request-status` call.
 *
 * Only `Assigned` and `Pickup Requested` are ever undone — the two values this
 * request (or a driver leaving its tool behind) could have written. Anything
 * else describes where the tool really is and stays.
 *
 * - Another open **delivery** holds it: their commitment, untouched.
 * - Another open **pickup** holds it: still wanted back, `Pickup Requested`.
 * - Nobody: `Available` in the yard, `Delivered` on a site — a trip drop's rule
 *   (`stockTakeStatusFor`), with a blank location read as the yard.
 */
export function planToolRelease(
  tools: readonly CandidateTool[],
  holders: ReadonlyMap<string, readonly ToolHolder[]>
): Map<ToolStatusNew, string[]> {
  const groups = new Map<ToolStatusNew, string[]>()

  for (const tool of tools) {
    if (tool.status !== TOOL_STATUS_ASSIGNED && tool.status !== TOOL_STATUS_PICKUP_REQUESTED) continue

    const others = holders.get(tool.id) ?? []
    if (others.some((other) => !isPickupRequest(other))) continue

    const target =
      others.length > 0
        ? TOOL_STATUS_PICKUP_REQUESTED
        : isWarehouseLocation(tool.location)
          ? TOOL_STATUS_AVAILABLE
          : TOOL_STATUS_DELIVERED
    if (target === tool.status) continue

    groups.set(target, [...(groups.get(target) ?? []), tool.id])
  }
  return groups
}

/** The line appended to `request.notes` — there is no field for who cancelled or why. */
export function cancelNoteLine(name: string, at: Date, reason?: string): string {
  const line = `Cancelled ${newYorkStamp(at)} by ${name}`
  return reason ? `${line}: ${reason}` : line
}
