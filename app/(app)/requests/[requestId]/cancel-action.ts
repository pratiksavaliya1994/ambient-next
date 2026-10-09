"use server"

import { revalidatePath } from "next/cache"

import type { CancelRequestState } from "@/app/(app)/requests/[requestId]/action-state"
import { displayNameOf, requireSession } from "@/lib/auth/session"
import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { isPickupRequest } from "@/lib/bubble/enums"
import { listLinkedPickupLines, releaseTransfersForClose } from "@/lib/bubble/material-transfers"
import { appendRequestNote, listOpenHolders, setToolStatuses } from "@/lib/bubble/request-cancel"
import { setRequestStatuses } from "@/lib/bubble/request-status"
import { getRequest } from "@/lib/bubble/requests"
import { listTripMaterialsForLines } from "@/lib/bubble/tripmaterial-read"
import { listToolClaims } from "@/lib/bubble/trips-read"
import { cancelBlockReason, cancelNoteLine, planToolRelease } from "@/lib/requests/cancel"
import { cancelRequestSchema } from "@/lib/schemas/trip"
import { syncRequestStatuses } from "@/lib/trips/sync-request-status"

import { releaseUnshippedStock } from "./release-stock"

/**
 * Cancels a request that never went out — stale, or made by mistake — and
 * gives back everything it held. Rules in `lib/requests/cancel.ts`, reasoning
 * in `docs/cancel-request.md`.
 *
 * Every write before the `Cancelled` one is safe to repeat (targets, not
 * deltas; tools already freed no longer match), so a failure part-way leaves
 * the request open and pressing Cancel again picks up where it stopped. Bubble
 * has no transactions, so this order is the whole of the safety.
 */
export async function cancelRequestAction(input: unknown): Promise<CancelRequestState> {
  const session = await requireSession()

  const parsed = cancelRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "That isn't a valid request." }
  }

  const { requestId, reason } = parsed.data
  const request = await getRequest(requestId)
  if (!request) return { status: "error", message: "That request no longer exists in Bubble." }

  // Fresh reads for the same rule the page hid the button on: the page is
  // however old its render is, and a trip may have been planned since.
  const pickup = isPickupRequest(request)
  const lineIds = request.materialLines.map((line) => line.id)
  const assigned = await listAssignedTools([requestId])
  const toolIds = [...new Set(assigned.map((row) => row.toolId))]
  const [tools, toolClaims, lineRows, linked] = await Promise.all([
    listToolsByIds(toolIds),
    listToolClaims(toolIds),
    listTripMaterialsForLines(lineIds),
    pickup ? null : listLinkedPickupLines(lineIds),
  ])
  const blocked = cancelBlockReason({
    status: request.status,
    toolClaims,
    lineRows,
    linkedRows: linked?.tripRows ?? [],
  })
  if (blocked) return { status: "error", message: blocked }

  // 1. Transfer links: pickup lines stop feeding this delivery, or this
  //    pickup's lines stop heading for one — either way they go to the yard.
  const transfers = await releaseTransfersForClose(request)
  if ("error" in transfers) return { status: "error", message: transfers.error }

  // 2. Warehouse stock back on the shelf.
  const stock = await releaseUnshippedStock(request, lineRows, displayNameOf(session))
  if ("error" in stock) return { status: "error", message: stock.error }

  // 3. Tools back to what they'd read if this request had never named them.
  const warnings: string[] = []
  const groups = planToolRelease(tools, await listOpenHolders(toolIds, requestId))
  try {
    for (const [toolStatus, ids] of groups) {
      const { toolsUpdated } = await setToolStatuses(requestId, request.status, ids, toolStatus)
      if (toolsUpdated !== ids.length) warnings.push(`${toolsUpdated} of ${ids.length} tools set to ${toolStatus}`)
    }
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? `Couldn't release the tools: ${error.message}` : "Couldn't release the tools.",
    }
  }

  // 4. The terminal write. `deriveRequestStatus` ratchets on it from here.
  try {
    await setRequestStatuses([requestId], "Cancelled")
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the change: ${error.message}` : "Bubble rejected the change.",
    }
  }

  // 5. Who, when, why. The cancel has landed; a refused note is only a warning.
  try {
    await appendRequestNote(requestId, cancelNoteLine(displayNameOf(session), new Date(), reason || undefined))
  } catch {
    warnings.push("the cancel note wasn't saved to the request's notes")
  }

  // 6. The requests on the other side of each cleared transfer. Non-fatal.
  const others = transfers.touchedRequestIds.filter((id) => id !== requestId)
  if (others.length > 0) {
    const synced = await syncRequestStatuses(others)
    if (synced.warning) warnings.push(synced.warning)
  }

  revalidatePath("/requests")
  revalidatePath(`/requests/${requestId}`)
  for (const id of others) revalidatePath(`/requests/${id}`)
  revalidatePath("/trips/new")
  if (groups.size > 0) revalidatePath("/tools")
  if (stock.released) revalidatePath("/materials")

  return {
    status: "cancelled",
    warning: warnings.length > 0 ? `Cancelled, but ${warnings.join("; ")}.` : undefined,
  }
}
