import { BanIcon, CheckIcon, TruckIcon, WrenchIcon } from "lucide-react"
import Link from "next/link"

import { CancelRequestAction } from "@/components/cancel-request-action"
import { CloseRequestAction } from "@/components/close-request-action"
import { CompleteDeliveryAction } from "@/components/complete-delivery-action"
import { assignLabelFor } from "@/components/request-card-action"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { isOpenRequest, isPickupRequest, type RequestStatus } from "@/lib/bubble/enums"
import type { ToolRequest } from "@/lib/bubble/requests"
import { isCancellable } from "@/lib/requests/cancel"

/**
 * What can be done next on the request detail page, from the request's status
 * and what is actually left outstanding. Moved out of the page in the Cancel
 * change, which pushed it further past the 300-line cap.
 *
 * Since phase 4 the page is **read-only about trips**: "Add to a trip" is a
 * link into the builder, shown only when the builder would have something of
 * this request's to show (`movableCount`). **Assigning stays open for the whole
 * life of an open request**, so a load that went out short can be filled in
 * later; a pickup never assigns, since its tools are named at creation.
 *
 * **Cancel** shows only up to the assign step and only while no trip holds
 * anything of the request's (`cancelBlocked`, from `cancelBlockReason`).
 * **Close** is its counterpart once something has landed. The terminal values
 * render a pill rather than a dead button.
 */
export function NextAction({
  request,
  toolCount,
  pendingPickupCount,
  undeliverableCount,
  outstandingSlots,
  unassignedLines,
  movableCount,
  hasLegacyTrip,
  cancelBlocked,
}: {
  request: ToolRequest
  toolCount: number
  /** Off-site tools still waiting to be collected — blocks delivery. See `CompleteDeliveryAction`. */
  pendingPickupCount: number
  /** Tools never collected or turned away at the site — doesn't block, but isn't delivered either. */
  undeliverableCount: number
  /** Requested units never assigned — what makes "Close request" meaningful. */
  outstandingSlots: number
  /** A delivery's material lines assigned short of what was asked. Always 0 on a pickup. */
  unassignedLines: number
  /** Assigned tools not yet where this request was sending them, plus material lines left to send. */
  movableCount: number
  /** `In Transit` under the **pre-trip** flow, with no run sheet to finish it from. See `docs/phase-4-trips.md`. */
  hasLegacyTrip: boolean
  /** A trip holds some of this request's tools or materials, so it can't be cancelled. */
  cancelBlocked: boolean
}) {
  const pickup = isPickupRequest(request)
  const terminal = pickup ? "Returned" : "Delivered"

  if (!isOpenRequest(request.status)) return <TerminalBadge status={request.status} />

  const partial = request.status === "Partially Delivered" || request.status === "Partially Returned"
  const dispatched = request.status !== "New" && request.status !== "Assigned"
  const legacy = request.status === "In Transit" && hasLegacyTrip

  // Once a request is on the road the link narrows to filling the slots that went out short.
  const canAssign = !pickup && (!dispatched || outstandingSlots > 0 || unassignedLines > 0)
  const assignLabel = dispatched
    ? "Assign remaining"
    : request.status === "New"
      ? assignLabelFor(request)
      : "Edit assignment"
  const nothingToOffer = !canAssign && movableCount === 0 && !partial && !legacy

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {/* Legacy only — see `hasLegacyTrip`. Everything else finishes at a trip stop. */}
      {legacy && (
        <CompleteDeliveryAction
          request={request}
          toolCount={toolCount}
          pendingPickupCount={pendingPickupCount}
          undeliverableCount={undeliverableCount}
        />
      )}

      {isCancellable(request.status) && !cancelBlocked && <CancelRequestAction requestId={request.id} pickup={pickup} />}

      {partial && (
        <CloseRequestAction requestId={request.id} outstanding={outstandingSlots} terminalLabel={terminal} />
      )}

      {canAssign && (
        <Link href={`/requests/${request.id}/assign`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <WrenchIcon />
          {assignLabel}
        </Link>
      )}

      {movableCount > 0 && (
        <Link href={`/trips/new?requestId=${request.id}`} className={buttonVariants({ size: "sm" })}>
          <TruckIcon />
          Add to a trip
        </Link>
      )}

      {/* Out on the road, fully assigned, nothing of this request's left to load. */}
      {nothingToOffer && request.status === "In Transit" && (
        <Badge className="border-transparent bg-status-attention/15 text-sm text-status-attention-foreground">
          <TruckIcon className="size-3.5" />
          On a trip
        </Badge>
      )}
    </div>
  )
}

/** `Delivered`/`Returned` read green and finished; `Cancelled` must not. */
function TerminalBadge({ status }: { status: RequestStatus }) {
  if (status === "Cancelled") {
    return (
      <Badge className="border-transparent bg-destructive/10 text-sm text-destructive">
        <BanIcon className="size-3.5" />
        Cancelled
      </Badge>
    )
  }

  return (
    <Badge className="border-transparent bg-status-ok/15 text-sm text-status-ok-foreground">
      <CheckIcon className="size-3.5" />
      {status}
    </Badge>
  )
}
