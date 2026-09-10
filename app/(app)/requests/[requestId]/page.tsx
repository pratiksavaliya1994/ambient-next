import { ArrowLeftIcon, CheckIcon, TriangleAlertIcon, TruckIcon, WrenchIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { CompleteDeliveryAction } from "@/components/complete-delivery-action"
import { RequestStatusBadge, statusIcon, statusIndex } from "@/components/request-status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
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
import { buildSlots, type AssignSlot, type CandidateTool } from "@/lib/bubble/assigned-tools-types"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { REQUEST_STATUS, type RequestStatus } from "@/lib/bubble/enums"
import { listToolTypes } from "@/lib/bubble/reference"
import { getRequest, type ToolRequest } from "@/lib/bubble/requests"
import { cn } from "@/lib/utils"

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

      <StatusStepper status={request.status} />

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
            <CardHeader>
              <CardTitle className="text-base">Requested tools</CardTitle>
              <span className="text-sm text-muted-foreground tabular-nums">
                {assignedCount(slots)} of {requestedCount(slots)} assigned
                {extraToolIds.length > 0 &&
                  ` · ${extraToolIds.length} extra ${extraToolIds.length === 1 ? "tool" : "tools"}`}
              </span>
              <CardAction>
                <NextAction request={request} toolCount={assigned.length} />
              </CardAction>
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
              {slots.length === 0 ? (
                <Empty className="border border-dashed py-8">
                  <EmptyHeader>
                    <EmptyTitle>No tools requested</EmptyTitle>
                    <EmptyDescription>
                      This request has no tool line — there is nothing to assign against.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="divide-y overflow-hidden rounded-lg border">
                  {slots.map((slot) => {
                    const tools = slot.toolIds
                      .map((id) => toolsById.get(id))
                      .filter((tool): tool is CandidateTool => Boolean(tool))

                    return (
                      <li key={slot.toolType} className="flex flex-col gap-2 bg-muted/40 px-3 py-2">
                        <div className="flex items-center justify-between gap-4">
                          <span className="min-w-0 flex-1 text-sm font-semibold wrap-anywhere">{slot.toolType}</span>
                          {slot.consumable ? (
                            <Badge variant="outline">Consumable</Badge>
                          ) : (
                            <span
                              className={cn(
                                "inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
                                slot.toolIds.length >= slot.requested
                                  ? "bg-status-ok/15 text-status-ok-foreground"
                                  : "bg-status-attention/15 text-status-attention-foreground"
                              )}
                            >
                              {slot.toolIds.length} of {slot.requested}
                            </span>
                          )}
                        </div>

                        {tools.length > 0 ? (
                          <ul className="flex flex-col gap-1.5 border-l-2 border-muted-foreground/25 pl-3">
                            {tools.map((tool) => (
                              <li
                                key={tool.id}
                                className="flex flex-col gap-0.5 rounded-md border bg-background px-2.5 py-1.5"
                              >
                                <span className="text-sm wrap-anywhere" title={tool.name}>
                                  {tool.name}
                                </span>
                                <span className="text-xs wrap-anywhere text-muted-foreground">
                                  {tool.location}
                                  {tool.floor && ` · Floor ${tool.floor}`}
                                  {tool.status && ` · ${tool.status}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          !slot.consumable && (
                            <p className="border-l-2 border-status-attention/50 pl-3 text-xs font-medium text-status-attention-foreground">
                              No tool assigned yet for this type
                            </p>
                          )
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {extraTools.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 border-t pt-4">
                  <FactLabel>Extra tools</FactLabel>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <ul className="flex flex-col gap-1.5 border-l-2 border-muted-foreground/25 pl-3">
                      {extraTools.map((tool) => (
                        <li
                          key={tool.id}
                          className="flex items-center gap-3 rounded-md border bg-background px-2.5 py-1.5"
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm" title={tool.name}>
                              {tool.name}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {tool.typeName ?? "No type"} · {tool.location}
                            </span>
                          </div>
                          <Badge variant="outline">Extra</Badge>
                        </li>
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
 * The one thing to do next, from the request's status.
 *
 * `Assigned` gets two actions: `Edit assignment` (the assign screen, in case
 * the load needs to change) and `Dispatch`, which sends the driver to
 * `/dispatch` — a shared board across many requests, not a per-request route
 * — with this request preselected via `?requestId=`, since `DispatchBoard`
 * reads that to seed its checkbox state. `Delivered` is terminal: the
 * lifecycle is over, so this renders a status pill rather than a dead button.
 */
function NextAction({ request, toolCount }: { request: ToolRequest; toolCount: number }) {
  if (request.status === "New") {
    return (
      <Link href={`/requests/${request.id}/assign`} className={buttonVariants({ size: "sm" })}>
        <WrenchIcon />
        Assign tools
      </Link>
    )
  }

  if (request.status === "Assigned") {
    return (
      <div className="flex items-center gap-1.5">
        <Link href={`/requests/${request.id}/assign`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <WrenchIcon />
          Edit assignment
        </Link>
        <Link href={`/dispatch?requestId=${request.id}`} className={buttonVariants({ size: "sm" })}>
          <TruckIcon />
          Dispatch
        </Link>
      </div>
    )
  }

  if (request.status === "In Transit") {
    return <CompleteDeliveryAction request={request} toolCount={toolCount} />
  }

  return (
    <Badge className="border-transparent bg-status-ok/15 text-sm text-status-ok-foreground">
      <CheckIcon className="size-3.5" />
      Delivered
    </Badge>
  )
}

function StatusStepper({ status }: { status: RequestStatus }) {
  const current = statusIndex(status)

  return (
    <Stepper value={current + 1} indicators={{ completed: <CheckIcon className="size-3.5" /> }}>
      <StepperNav className="gap-3">
        {REQUEST_STATUS.map((step, index) => {
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

              {index < REQUEST_STATUS.length - 1 && (
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
