import { ArrowLeftIcon, WrenchIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RequestStatusBadge, statusIcon, statusIndex } from "@/components/request-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { listAssignedTools } from "@/lib/bubble/assigned-tools"
import { buildSlots, type AssignSlot } from "@/lib/bubble/assigned-tools-types"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { REQUEST_STATUS, type RequestStatus } from "@/lib/bubble/enums"
import { listToolTypes } from "@/lib/bubble/reference"
import { getRequest, type ToolRequest } from "@/lib/bubble/requests"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Request" }

/**
 * One request, and what to do with it next.
 *
 * Deliberately light: the header comes from `getRequest`, and the only extra
 * read is the request's own `assignedtools` rows — a single `in` query on a
 * child table. It does **not** touch the `tools` table, so it stays fast
 * whatever state the request is in; naming the physical tools is the assign
 * screen's job, and that screen pays for it.
 */
export default async function RequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params

  const request = await getRequest(requestId)
  if (!request) notFound()

  const [assigned, toolTypes] = await Promise.all([listAssignedTools([request.id]), listToolTypes()])
  const { slots, extraToolIds } = buildSlots(request.tools, assigned, toolTypes)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Link
            href="/requests"
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "-ml-2 w-fit text-muted-foreground",
            })}
          >
            <ArrowLeftIcon />
            Back to requests
          </Link>
          <h1 className="text-xl font-medium wrap-anywhere">{request.job}</h1>
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

        <NextAction request={request} />
      </div>

      <StatusStepper status={request.status} />

      <Card data-size="sm">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
            <Fact label="Date" value={newYorkDayLabel(request.start ?? request.end)} />
            <Fact label="Until" value={request.end ? newYorkDayLabel(request.end) : null} />
            <Fact label="Window" value={request.timeRange} />
            <Fact label="Field PM" value={request.fieldPm} />
            <Fact label="Floor" value={request.floor} />
            <Fact label="Driver" value={request.driver} />
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

      <Card data-size="sm">
        <CardHeader>
          <CardTitle className="text-base">Requested tools</CardTitle>
          <span className="text-sm text-muted-foreground tabular-nums">
            {assignedCount(slots)} of {requestedCount(slots)} assigned
            {extraToolIds.length > 0 &&
              ` · ${extraToolIds.length} extra ${extraToolIds.length === 1 ? "tool" : "tools"}`}
          </span>
        </CardHeader>
        <CardContent>
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
              {slots.map((slot) => (
                <li key={slot.toolType} className="flex items-center justify-between gap-4 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm wrap-anywhere">{slot.toolType}</span>
                  {slot.consumable ? (
                    <Badge variant="outline">Consumable</Badge>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
                        slot.toolIds.length >= slot.requested
                          ? "bg-status-ok/15 text-status-ok-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {slot.toolIds.length} of {slot.requested}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {request.materials.length > 0 && (
            <div className="mt-4 flex flex-col gap-1 border-t pt-4">
              <FactLabel>Materials</FactLabel>
              <ul className="text-sm">
                {request.materials.map((line, index) => (
                  <li key={index} className="wrap-anywhere">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
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
 * Dispatch (2B) and offload (2C) aren't built, so their buttons are shown
 * disabled rather than hidden — the lifecycle is easier to read when the whole
 * of it is on screen and only the unbuilt part is greyed out.
 */
function NextAction({ request }: { request: ToolRequest }) {
  if (request.status === "New" || request.status === "Assigned") {
    return (
      <Link href={`/requests/${request.id}/assign`} className={buttonVariants({ size: "sm" })}>
        <WrenchIcon />
        {request.status === "New" ? "Assign tools" : "Edit assignment"}
      </Link>
    )
  }

  return (
    <Button size="sm" disabled>
      {request.status === "In Transit" ? "Offload — not built yet" : "Delivered"}
    </Button>
  )
}

function StatusStepper({ status }: { status: RequestStatus }) {
  const current = statusIndex(status)

  return (
    <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
      {REQUEST_STATUS.map((step, index) => {
        const Icon = statusIcon(step)
        const done = index < current
        const active = index === current

        return (
          <li
            key={step}
            className={cn(
              "flex items-center gap-2 bg-background p-3 text-sm",
              active && "bg-muted font-medium",
              !active && !done && "text-muted-foreground"
            )}
          >
            <Icon className={cn("size-4 shrink-0", done && "text-status-ok-foreground")} />
            <span className="truncate">{step}</span>
          </li>
        )
      })}
    </ol>
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
