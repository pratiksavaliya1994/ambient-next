"use client"

import Link from "next/link"
import { MapPinIcon, TriangleAlertIcon, WrenchIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { StopNumber } from "@/components/stop-number"
import { TripToolList } from "@/components/trip-tool-list"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { isSequenced, stopPosition } from "@/lib/bubble/enums"
import type { DispatchRequestSummary } from "@/lib/dispatch/summary"
import { cn } from "@/lib/utils"

/**
 * One selectable request on the Dispatch board, extracted out of
 * `components/dispatch-board.tsx` — that file was already past both the
 * component and file size limits before the stop badge needed somewhere to go.
 *
 * The badge shows the **stored** position, not a row index, and only for a
 * request that has actually been sequenced. This board isn't grouped by
 * driver and is sorted by time, so an index here would be a number about
 * nothing. In practice that means no badge until a request comes back round
 * for a second trip — ordering happens after dispatch, on `/dispatch/active`.
 */
export function DispatchRequestRow({
  request,
  checked,
  blocked,
  onToggle,
}: {
  request: DispatchRequestSummary
  checked: boolean
  /** A tool on this request is mid-flow elsewhere — it can't go out yet. */
  blocked: boolean
  onToggle: (checked: boolean) => void
}) {
  return (
    <Item
      size="sm"
      variant="outline"
      className={cn(
        "items-start bg-background shadow-sm transition-colors sm:flex-nowrap sm:items-center",
        blocked ? "opacity-70" : "cursor-pointer hover:bg-muted/40",
        checked && "border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/5"
      )}
    >
      <Checkbox
        className="mt-0.5 shrink-0 sm:mt-0"
        checked={checked}
        disabled={blocked}
        onCheckedChange={(next) => onToggle(next === true)}
        aria-label={`Select ${request.job}`}
      />
      <ItemContent className="min-w-0" onClick={() => !blocked && onToggle(!checked)}>
        {/* `ItemTitle` is itself a flex row, so the clamp goes on the text
            child — `line-clamp` needs `display: -webkit-box` and would fight
            the flex container. Top-aligned so the chip sits with the first
            line when the job name wraps on a phone. */}
        <ItemTitle className="w-full items-start">
          {isSequenced(request.order) && <StopNumber position={stopPosition(request.order)} />}
          <span className="line-clamp-2 min-w-0 flex-1 wrap-anywhere sm:line-clamp-1" title={request.job}>
            {request.job}
          </span>
        </ItemTitle>
        <ItemDescription className="sm:truncate">
          {newYorkDayLabel(request.start ?? request.end)}
          {request.timeRange && ` · ${request.timeRange}`}
          {request.fieldPm && ` · ${request.fieldPm}`}
        </ItemDescription>
        <TripToolList requestId={request.id} tools={request.tools} />
        <DispatchRequestNotices request={request} blocked={blocked} />
      </ItemContent>
      {/* Below `sm` this wraps onto its own full-width line — `basis-full`, the
          same trick `ItemFooter` uses — so the job name keeps the first line to
          itself instead of being squeezed by three controls. */}
      <ItemActions
        className="basis-full justify-between border-t pt-2 sm:shrink-0 sm:basis-auto sm:justify-end sm:border-t-0 sm:pt-0"
        onClick={(event) => event.stopPropagation()}
      >
        <Badge variant="outline" className="tabular-nums">
          {request.toolCount} {request.toolCount === 1 ? "tool" : "tools"}
        </Badge>
        <div className="flex items-center gap-3">
          <Link
            href={`/requests/${request.id}/assign`}
            className="flex items-center gap-1 py-1.5 text-xs text-muted-foreground hover:underline sm:py-0"
          >
            <WrenchIcon className="size-3" />
            Edit assignment
          </Link>
          <Link
            href={`/requests/${request.id}`}
            className="py-1.5 text-xs text-muted-foreground hover:underline sm:py-0"
          >
            View
          </Link>
        </div>
      </ItemActions>
    </Item>
  )
}

/**
 * The blue rows above already say which tools; this says what the driver is
 * signing up for by taking this request — extra stops, before the delivery.
 */
function pickupSummary(stops: DispatchRequestSummary["pickupStops"]): string {
  const tools = stops.reduce((sum, stop) => sum + stop.toolIds.length, 0)
  return `Pick up ${tools} ${tools === 1 ? "tool" : "tools"} from ${stops.length} other job ${
    stops.length === 1 ? "site" : "sites"
  } before delivering`
}

/** The three things a row may have to warn about, in the order they matter. */
function DispatchRequestNotices({ request, blocked }: { request: DispatchRequestSummary; blocked: boolean }) {
  return (
    <>
      {request.missing.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-md bg-status-attention/15 px-2 py-1.5 text-xs text-status-attention-foreground">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 wrap-anywhere">
            <span className="font-medium">Not fully assigned</span> — missing{" "}
            {request.missing.map((line) => `${line.toolType} ×${line.short}`).join(", ")}
          </span>
        </div>
      )}
      {request.pickupStops.length > 0 && (
        <span className="flex items-start gap-1.5 text-xs font-medium text-status-active-foreground">
          <MapPinIcon className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 wrap-anywhere">{pickupSummary(request.pickupStops)}</span>
        </span>
      )}
      {/* The rows above already name the offending tools in red — this says
          what that costs: the checkbox is disabled. */}
      {blocked && (
        <div className="flex items-start gap-1.5 rounded-md bg-destructive/15 px-2 py-1.5 text-xs text-destructive">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 wrap-anywhere">
            <span className="font-medium">Not available to dispatch</span> — {request.notReady.length}{" "}
            {request.notReady.length === 1 ? "tool is" : "tools are"} on another request
          </span>
        </div>
      )}
    </>
  )
}

/** The board's list of selectable requests. */
export function DispatchRequestList({
  requests,
  selected,
  onToggle,
}: {
  requests: DispatchRequestSummary[]
  selected: Set<string>
  onToggle: (id: string, checked: boolean) => void
}) {
  return (
    <ItemGroup className="gap-2">
      {requests.map((request) => (
        <DispatchRequestRow
          key={request.id}
          request={request}
          checked={selected.has(request.id)}
          blocked={request.notReady.length > 0}
          onToggle={(checked) => onToggle(request.id, checked)}
        />
      ))}
    </ItemGroup>
  )
}
