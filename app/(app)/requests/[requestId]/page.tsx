import { ArrowLeftIcon, CheckIcon, TriangleAlertIcon, TruckIcon, WrenchIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AssignedToolRow } from "@/components/assigned-tool-row"
import { CloseRequestAction } from "@/components/close-request-action"
import { CompleteDeliveryAction } from "@/components/complete-delivery-action"
import { RequestStatusBadge, statusIcon, statusIndex } from "@/components/request-status-badge"
import { RequestToolSlots } from "@/components/request-tool-slots"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper"
import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { assignedLabel, buildSlots, type AssignSlot, type CandidateTool } from "@/lib/bubble/assigned-tools-types"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { isOpenRequest, isPickupRequest, requestSteps, type RequestStatus } from "@/lib/bubble/enums"
import { listTripFlags } from "@/lib/bubble/triptool-read"
import { listToolClaims } from "@/lib/bubble/trips-read"
import { listToolTypes } from "@/lib/bubble/reference"
import { getRequest, type ToolRequest } from "@/lib/bubble/requests"
import { deriveTripStatus } from "@/lib/dispatch/tool-state"

export const metadata: Metadata = { title: "Request" }

/**
 * One request, and what to do with it next.
 *
 * The header comes from `getRequest`; `assignedtools` is one `in` query on a
 * child table, and naming the assigned tools is one more `in` query on `tools`
 * by the ids that query returned — no table scan, whatever state the request
 * is in.
 */
export default async function RequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params

  const request = await getRequest(requestId)
  if (!request) notFound()

  const [assigned, toolTypes] = await Promise.all([listAssignedTools([request.id]), listToolTypes()])
  const { slots, extraToolIds } = buildSlots(request.tools, assigned, toolTypes)
  const incompleteSlots = slots.filter((slot) => !slot.consumable && slot.toolIds.length < slot.requested)

  const toolIds = [...slots.flatMap((slot) => slot.toolIds), ...extraToolIds]
  const resolvedTools = await listToolsByIds([...new Set(toolIds)])
  const toolsById = new Map(resolvedTools.map((tool) => [tool.id, tool]))
  const extraTools = extraToolIds.map((id) => toolsById.get(id)).filter((tool): tool is CandidateTool => Boolean(tool))

  // Which trip, if any, is carrying each of this request's tools — so the page
  // can say "on Rosa's trip" instead of just "In Transit", now that a request's
  // tools can be spread across several — and what the last trip made of each,
  // which is what the amber "Not picked up" and "Refused" rows are read off.
  const [claims, flagsByRequest] = await Promise.all([listToolClaims(toolIds), listTripFlags(toolIds)])

  // Every status but `New` wants this — `Assigned` to review which tools the
  // driver will have to collect en route *before* committing to dispatch,
  // `In Transit` to watch them actually being collected, a partial to tell the
  // tools already dropped from the ones still owed, and a terminal one to keep
  // saying which ones never made it. `New` has nothing assigned to classify.
  // Reuses the same classification `toDispatchSummaries` gives the Dispatch
  // board / Active trips screens, off the tools already read above, and colours
  // each row in the tools list rather than a list of its own.
  const tripStatus =
    request.status === "New"
      ? null
      : deriveTripStatus(request, assigned, toolsById, flagsByRequest.get(request.id))
  // Confirming or declining a pickup writes to a tool on this trip, so both
  // only mean anything once the request itself has been dispatched.
  const canPickUp = request.status === "In Transit"
  const pendingPickupCount = tripStatus?.pickupStops.reduce((sum, stop) => sum + stop.toolIds.length, 0) ?? 0
  const undeliverableCount = tripStatus?.undeliverable.length ?? 0

  // An `In Transit` request with no trip row at all was dispatched under the
  // pre-phase-4 flow. It has no run sheet to finish it from, so the old
  // Complete-delivery path stays reachable for it. See the migration note in
  // `docs/phase-4-trips.md`.
  const hasLegacyTrip = request.status === "In Transit" && claims.size === 0
  const outstandingSlots = incompleteSlots.reduce((sum, slot) => sum + (slot.requested - slot.toolIds.length), 0)

  // Assigned tools a trip could still take: not yet where this request was
  // sending them (`hasLanded`, via `deriveTripStatus`'s two landed states — the
  // same test the builder's own pool filters on) and not already held by an
  // open trip. Both halves are what makes "Add to a trip" honest. A partially
  // delivered request whose every assigned tool had landed offered the link
  // anyway, and it led to a builder the request wasn't even listed in — with no
  // way to assign the tools it was actually short of.
  const movableCount = tripStatus
    ? tripStatus.tools.filter(
        (entry) => entry.state !== "delivered" && entry.state !== "returned" && !claims.has(entry.tool.id)
      ).length
    : assigned.length

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-medium wrap-anywhere">{request.job}</h1>
          <Link
            href="/requests"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
          >
            <ArrowLeftIcon />
            Back to requests
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <RequestStatusBadge status={request.status} />
          {request.toDo && <Badge variant="secondary">{request.toDo}</Badge>}
          {request.weAre && <Badge variant="outline">{request.weAre}</Badge>}
          {request.delivery && <Badge variant="outline">Delivery</Badge>}
          {request.pickup && <Badge variant="outline">Pickup</Badge>}
          {request.tentative && <Badge variant="outline">Tentative</Badge>}
          {request.completed && <Badge>Completed</Badge>}
        </div>
      </div>

      <StatusStepper status={request.status} steps={requestSteps(request)} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {/* Left column — the request itself */}
        <div className="flex flex-col gap-6">
          <Card data-size="sm">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[auto_1fr] divide-x overflow-hidden rounded-lg border bg-background/70">
                <div className="flex min-w-28 flex-col gap-1 p-3">
                  <FactLabel>{dateLabelFor(request)}</FactLabel>
                  <span className="text-base leading-tight font-semibold wrap-anywhere">
                    {newYorkDayLabel(request.start ?? request.end)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <FactLabel>Window</FactLabel>
                  <span className="text-sm leading-snug wrap-anywhere">{request.timeRange || "Not set"}</span>
                </div>
              </div>

              {request.driver && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border bg-status-attention/10 p-3">
                  <Avatar>
                    <AvatarFallback>{driverInitials(request.driver)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5">
                    <FactLabel>Driver</FactLabel>
                    <span className="text-sm font-semibold wrap-anywhere">{request.driver}</span>
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
                <Fact label="Until" value={request.end ? newYorkDayLabel(request.end) : null} />
                <Fact label="Field PM" value={request.fieldPm} />
                <Fact label="Floor" value={request.floor} />
                <Fact label="Contact" value={request.contact} sub={request.contactPhone} />
              </div>

              {(request.notes || request.toolsNotes) && (
                <div className="mt-4 flex flex-col gap-3 border-t pt-4">
                  {request.notes && <Note label="Notes">{request.notes}</Note>}
                  {request.toolsNotes && <Note label="Tool notes">{request.toolsNotes}</Note>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — tools to assign + materials */}
        <div className="flex flex-col gap-6">
          <Card data-size="sm">
            <CardHeader className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Requested tools</CardTitle>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {assignedLabel(assignedCount(slots), requestedCount(slots))}
                  {extraToolIds.length > 0 &&
                    ` · ${extraToolIds.length} extra ${extraToolIds.length === 1 ? "tool" : "tools"}`}
                </span>
              </div>
              <div className="ml-auto">
                <NextAction
                  request={request}
                  toolCount={assigned.length}
                  pendingPickupCount={pendingPickupCount}
                  undeliverableCount={undeliverableCount}
                  outstandingSlots={outstandingSlots}
                  movableCount={movableCount}
                  hasLegacyTrip={hasLegacyTrip}
                />
              </div>
            </CardHeader>
            <CardContent>
              {incompleteSlots.length > 0 && (
                <div className="mb-4 flex items-start gap-1.5 rounded-md bg-status-attention/15 px-3 py-2 text-sm text-status-attention-foreground">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 wrap-anywhere">
                    <span className="font-medium">Not fully assigned</span> — missing{" "}
                    {incompleteSlots
                      .map((slot) => `${slot.toolType} ×${slot.requested - slot.toolIds.length}`)
                      .join(", ")}
                    {request.status === "Assigned" && " Dispatching now would send this request out incomplete."}
                    {(request.status === "In Transit" || request.status === "Delivered") &&
                      " This request went out incomplete."}
                  </span>
                </div>
              )}
              <RequestToolSlots
                requestId={request.id}
                slots={slots}
                toolsById={toolsById}
                toolStates={tripStatus?.byToolId ?? null}
                canPickUp={canPickUp}
              />

              {extraTools.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 border-t pt-4">
                  <FactLabel>Extra tools</FactLabel>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <ul className="flex flex-col gap-1.5 border-l-2 border-muted-foreground/25 pl-3">
                      {extraTools.map((tool) => (
                        <AssignedToolRow
                          key={tool.id}
                          requestId={request.id}
                          tool={tool}
                          state={tripStatus?.byToolId.get(tool.id) ?? null}
                          canPickUp={canPickUp}
                          extra
                        />
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {request.materials.length > 0 && (
            <Card data-size="sm">
              <CardHeader>
                <CardTitle className="text-base">Materials</CardTitle>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {request.materials.length} {request.materials.length === 1 ? "line" : "lines"}
                </span>
              </CardHeader>
              <CardContent>
                <ul className="divide-y overflow-hidden rounded-lg border">
                  {request.materials.map((line, index) => (
                    <li key={index} className="px-3 py-2 text-sm wrap-anywhere">
                      {line}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A request is a delivery date, a pickup date, or (rarely) both — and either
 * way only the start date is shown, so the tile's own label follows suit
 * rather than always reading the generic "Date" a two-sided request needs.
 * Mirrors the listing page's `dateLabelFor`.
 */
function dateLabelFor(request: ToolRequest) {
  if (request.pickup && !request.delivery) return "Pickup date"
  if (request.delivery && !request.pickup) return "Drop date"
  return "Date"
}

function requestedCount(slots: AssignSlot[]): number {
  return slots.filter((slot) => !slot.consumable).reduce((sum, slot) => sum + slot.requested, 0)
}

function assignedCount(slots: AssignSlot[]): number {
  return slots.reduce((sum, slot) => sum + slot.toolIds.length, 0)
}

/**
 * What can be done next, from the request's status and what is actually left
 * outstanding.
 *
 * Since phase 4 this page is **read-only about trips**: a request no longer
 * dispatches itself, because its tools can go out on several different trips
 * under several different drivers. "Add to a trip" is a link into the builder,
 * not an action here — and it only appears when the builder would have
 * something of this request's to show (`movableCount`), since a request whose
 * every assigned tool has landed is not waiting on a drive, it is waiting on
 * the tools nobody assigned.
 *
 * Which is the other half: **assigning stays open for the whole life of an
 * open request**, not just before dispatch. A load that goes out short is
 * exactly what the partial statuses exist for, and until this it was a dead
 * end — the trip left, the button vanished, and the missing tools could never
 * be added. `assignToolsAction` keeps the status from sliding back to
 * `Assigned` and the assign screen locks whatever has already gone.
 *
 * Pickup is the one exception, which is a live bug fixed in passing: a
 * pickup-only request offered "Assign tools" pointing at a screen built
 * entirely around requested tool *types* and their quantities — which a pickup
 * request does not have, since its physical tools are named at creation.
 *
 * Both terminal values render a pill rather than a dead button. So does an
 * `In Transit` request with nothing left to decide, which is the only case
 * where there is genuinely nothing to offer.
 */
function NextAction({
  request,
  toolCount,
  pendingPickupCount,
  undeliverableCount,
  outstandingSlots,
  movableCount,
  hasLegacyTrip,
}: {
  request: ToolRequest
  toolCount: number
  /** Off-site tools still waiting to be collected — blocks delivery. See `CompleteDeliveryAction`. */
  pendingPickupCount: number
  /** Tools never collected or turned away at the site — doesn't block, but isn't delivered either. */
  undeliverableCount: number
  /** Requested units never assigned — what makes "Close request" meaningful. */
  outstandingSlots: number
  /** Assigned tools not yet where this request was sending them — what a trip would carry. */
  movableCount: number
  /**
   * `In Transit` under the **pre-trip** flow — dispatched before phase 4, so it
   * has no `triptool` rows and no run sheet to finish it from. The old
   * Complete-delivery path stays reachable for exactly these until they drain;
   * see `docs/phase-4-trips.md`.
   */
  hasLegacyTrip: boolean
}) {
  const pickup = isPickupRequest(request)
  const terminal = pickup ? "Returned" : "Delivered"

  if (!isOpenRequest(request.status)) {
    return (
      <Badge className="border-transparent bg-status-ok/15 text-sm text-status-ok-foreground">
        <CheckIcon className="size-3.5" />
        {request.status}
      </Badge>
    )
  }

  const partial = request.status === "Partially Delivered" || request.status === "Partially Returned"
  const dispatched = request.status !== "New" && request.status !== "Assigned"
  const legacy = request.status === "In Transit" && hasLegacyTrip

  // A pickup names its tools at creation, so there is no type-and-quantity
  // assignment to edit. Once a request is on the road the link narrows to the
  // one job still worth doing from here — filling the slots that went out
  // short; swapping tools around a load already moving is not it.
  const canAssign = !pickup && (!dispatched || outstandingSlots > 0)
  const assignLabel = dispatched ? "Assign remaining" : request.status === "New" ? "Assign tools" : "Edit assignment"
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

      {/* Out on the road, fully assigned, nothing of this request's left to
          load. The badge is the whole answer — and by construction it never
          sits beside a button. */}
      {nothingToOffer && request.status === "In Transit" && (
        <Badge className="border-transparent bg-status-attention/15 text-sm text-status-attention-foreground">
          <TruckIcon className="size-3.5" />
          On a trip
        </Badge>
      )}
    </div>
  )
}

/**
 * The four steps of *this request's* branch — `requestSteps` picks delivery or
 * pickup, so a pickup ends at `Returned` rather than showing a `Delivered` step
 * it will never reach.
 *
 * It walks `steps`, not `REQUEST_STATUS`. Since phase 4 the union carries seven
 * values across two terminal branches, and both partials share a slot with
 * `In Transit` (`statusStepIndex`) — rendering the union flat would give every
 * request three columns it never passes through.
 */
function StatusStepper({ status, steps }: { status: RequestStatus; steps: readonly RequestStatus[] }) {
  const current = statusIndex(status)

  return (
    <Stepper value={current + 1} indicators={{ completed: <CheckIcon className="size-3.5" /> }}>
      <StepperNav className="gap-3">
        {steps.map((step, index) => {
          const Icon = statusIcon(step)

          return (
            <StepperItem key={step} step={index + 1} className="relative items-start">
              <StepperTrigger render={<div />} className="flex grow cursor-default flex-col items-start gap-2.5">
                <StepperIndicator className="size-8 border-2 data-[state=completed]:border-status-ok data-[state=completed]:bg-status-ok data-[state=completed]:text-white data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground">
                  <Icon className="size-4" />
                </StepperIndicator>
                <div className="flex flex-col items-start gap-1">
                  {/* <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Step {index + 1}
                  </span> */}
                  <StepperTitle className="text-sm font-semibold data-[state=active]:text-status-active-foreground data-[state=completed]:text-status-ok-foreground data-[state=inactive]:text-muted-foreground">
                    {step}
                  </StepperTitle>
                </div>
              </StepperTrigger>

              {index < steps.length - 1 && (
                <StepperSeparator className="absolute inset-x-0 start-9 top-4 m-0 group-data-[orientation=horizontal]/stepper-nav:w-[calc(100%-2rem)] group-data-[orientation=horizontal]/stepper-nav:flex-none group-data-[state=completed]/step:bg-status-ok" />
              )}
            </StepperItem>
          )
        })}
      </StepperNav>
    </Stepper>
  )
}

function Fact({ label, value, sub }: { label: string; value: string | null; sub?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 bg-background p-3">
      <FactLabel>{label}</FactLabel>
      <span className="text-sm font-medium wrap-anywhere">{value || "—"}</span>
      {sub && <span className="text-xs wrap-anywhere text-muted-foreground">{sub}</span>}
    </div>
  )
}

function driverInitials(driverName: string) {
  const words = driverName.trim().split(/\s+/)
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase()
}

function FactLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</span>
}

function Note({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <FactLabel>{label}</FactLabel>
      <p className="text-sm wrap-anywhere whitespace-pre-line text-muted-foreground">{children}</p>
    </div>
  )
}
