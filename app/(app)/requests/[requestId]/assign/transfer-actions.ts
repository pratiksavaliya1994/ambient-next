"use server"

import { revalidatePath } from "next/cache"

import { requireSession } from "@/lib/auth/session"
import { isOpenRequest, isPickupRequest } from "@/lib/bubble/enums"
import {
  getMaterialLine,
  linkPartOfPickupLine,
  listLinkedPickupLines,
  setTransferLink,
  transferLockReason,
  waitForLine,
} from "@/lib/bubble/material-transfers"
import { effectiveQty, lineProgress } from "@/lib/bubble/requested-materials-types"
import { getRequest } from "@/lib/bubble/requests"
import { listTripMaterialsForLines } from "@/lib/bubble/tripmaterial-read"
import { linkTransferSchema, unlinkTransferSchema } from "@/lib/schemas/material"
import { syncRequestStatuses } from "@/lib/trips/sync-request-status"
import type { TransferActionState } from "./transfer-state"

/**
 * Site-to-site transfers, from the **delivery's** assign page (5F §2.6).
 *
 * Linking sets the pickup line's three `transferTo…` fields by `PATCH`. A
 * pickup line needs no approval (it counts as assigned from creation), so
 * there is nothing else to write — unless its estimate is **more than the
 * delivery still needs**: then only that much is linked, and the rest is split
 * off into its own line heading for the warehouse (`linkPartOfPickupLine`).
 * "Still needs" is what's asked for less what's assigned from stock and what
 * other transfers already bring.
 *
 * A `tripmaterial` row names only the pickup's request, so both requests are
 * re-synced here by hand. A sync failure is a warning: the link landed.
 */

const SETTLE_WARNING = "Linked, but Bubble is still saving it. Reload in a moment to check."

export async function linkTransferAction(input: unknown): Promise<TransferActionState> {
  await requireSession()

  const parsed = linkTransferSchema.safeParse(input)
  if (!parsed.success) return { status: "error", message: "That isn't a valid transfer." }
  const { deliveryLineId, pickupLineId } = parsed.data

  const [deliveryLine, pickupLine] = await Promise.all([getMaterialLine(deliveryLineId), getMaterialLine(pickupLineId)])
  if (!deliveryLine || !pickupLine) return { status: "error", message: "One of those lines no longer exists. Reload the page." }

  const [deliveryRequest, pickupRequest, tripRows, linked] = await Promise.all([
    getRequest(deliveryLine.requestId),
    getRequest(pickupLine.requestId),
    listTripMaterialsForLines([pickupLine.id]),
    listLinkedPickupLines([deliveryLine.id]),
  ])
  if (!deliveryRequest || !pickupRequest) {
    return { status: "error", message: "One of those requests no longer exists. Reload the page." }
  }

  const refusal = (() => {
    if (deliveryLine.kind !== "Inventory" || pickupLine.kind !== "Inventory") {
      return "Only catalogue materials can be transferred between sites."
    }
    if (deliveryLine.materialId !== pickupLine.materialId) return `${pickupLine.name} isn't the same material.`
    if (isPickupRequest(deliveryRequest) || !isPickupRequest(pickupRequest)) {
      return "A transfer links a pickup line to a delivery line."
    }
    if (!isOpenRequest(deliveryRequest.status)) return `This delivery is already ${deliveryRequest.status}.`
    if (!isOpenRequest(pickupRequest.status)) return `The pickup at ${pickupRequest.job} is already ${pickupRequest.status}.`
    if (deliveryRequest.job === pickupRequest.job) return "That pickup is at this delivery's own job."
    if (pickupLine.transferToLineId !== "" && pickupLine.transferToLineId !== deliveryLine.id) {
      return `${pickupLine.name} from ${pickupRequest.job} already feeds another delivery.`
    }
    return transferLockReason(pickupLine, tripRows)
  })()
  if (refusal) return { status: "error", message: refusal }

  // Already linked here: nothing to write.
  if (pickupLine.transferToLineId === deliveryLine.id) return { status: "linked" }

  const coverage = lineProgress(deliveryLine, linked.tripRows, { linked: linked.lines }).linkedCoverage
  const need = effectiveQty(deliveryLine) - deliveryLine.assignedQty - coverage
  if (need <= 0) {
    return {
      status: "error",
      message: `${deliveryLine.name} is already covered. Lower its stock assignment or cancel another transfer first.`,
    }
  }
  const keep = Math.min(need, effectiveQty(pickupLine))
  const link = { lineId: deliveryLine.id, requestId: deliveryRequest.id, location: deliveryRequest.job }

  try {
    if (keep < effectiveQty(pickupLine)) await linkPartOfPickupLine(pickupLine, keep, link)
    else await setTransferLink(pickupLine.id, link)
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the transfer: ${error.message}` : "Bubble rejected the transfer.",
    }
  }

  const settled = await waitForLine(
    pickupLine.id,
    (line) => line.transferToLineId === deliveryLine.id && effectiveQty(line) === keep
  ).catch(() => false)
  const sync = await syncRequestStatuses([deliveryRequest.id, pickupRequest.id])

  revalidateTransfer(deliveryRequest.id, pickupRequest.id)
  const splitOff = effectiveQty(pickupLine) - keep
  return {
    status: "linked",
    warning: warningOf(settled ? undefined : SETTLE_WARNING, sync.warning),
    ...(splitOff > 0 ? { splitOff } : {}),
  }
}

/**
 * Clears a link. The line goes back to heading for the warehouse. Refused while a trip holds the line, or once it's collected.
 */
export async function unlinkTransferAction(input: unknown): Promise<TransferActionState> {
  await requireSession()

  const parsed = unlinkTransferSchema.safeParse(input)
  if (!parsed.success) return { status: "error", message: "That isn't a valid transfer." }

  const pickupLine = await getMaterialLine(parsed.data.pickupLineId)
  if (!pickupLine) return { status: "error", message: "That line no longer exists. Reload the page." }
  if (pickupLine.transferToLineId === "") return { status: "unlinked" }

  const refusal = transferLockReason(pickupLine, await listTripMaterialsForLines([pickupLine.id]))
  if (refusal) return { status: "error", message: refusal }

  try {
    await setTransferLink(pickupLine.id, null)
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the change: ${error.message}` : "Bubble rejected the change.",
    }
  }

  const settled = await waitForLine(pickupLine.id, (line) => line.transferToLineId === "").catch(() => false)
  const sync = await syncRequestStatuses([pickupLine.transferToRequestId, pickupLine.requestId])

  revalidateTransfer(pickupLine.transferToRequestId, pickupLine.requestId)
  return {
    status: "unlinked",
    warning: warningOf(settled ? undefined : "Unlinked, but Bubble is still saving it. Reload in a moment to check.", sync.warning),
  }
}

function warningOf(...warnings: (string | undefined)[]): string | undefined {
  return warnings.filter(Boolean).join(" ") || undefined
}

function revalidateTransfer(...requestIds: string[]): void {
  revalidatePath("/requests")
  revalidatePath("/trips/new")
  for (const id of new Set(requestIds.filter(Boolean))) {
    revalidatePath(`/requests/${id}`)
    revalidatePath(`/requests/${id}/assign`)
  }
}
