import { MapPinIcon, PackageCheckIcon, PackageXIcon, TriangleAlertIcon, TruckIcon, UndoIcon } from "lucide-react"

import { LeaveBehindButton } from "@/components/leave-behind-button"
import { PickupToolButton } from "@/components/pickup-tool-button"
import { Badge } from "@/components/ui/badge"
import type { CandidateTool } from "@/lib/bubble/assigned-tools-types"
import { isWarehouseLocation } from "@/lib/bubble/enums"
import type { ToolTripState } from "@/lib/dispatch/tool-state"
import { cn } from "@/lib/utils"

/**
 * One physical tool, coloured by where it actually is right now
 * (`deriveTripStatus`). Shared by the request detail page's tools list, the
 * Dispatch board and Active trips, so a tool looks the same wherever it turns
 * up; `state` is `null` for an unremarkable tool — one sitting free at the
 * warehouse, before its request is assigned or after it was closed without
 * ever moving — and the row falls back to the plain location line.
 *
 * A tool still sitting on another job site carries its own "Picked up" and
 * "Not picked up" buttons where those actions are live (`canPickUp`), so the
 * itinerary lives on the tools themselves rather than in a separate list
 * repeating them.
 */
export function AssignedToolRow({
  requestId,
  tool,
  state,
  extra = false,
  compact = false,
  canPickUp = false,
}: {
  requestId: string
  tool: CandidateTool
  state: ToolTripState | null
  /** An assigned tool with no matching requested line — gets an "Extra" badge. */
  extra?: boolean
  /** Tighter type and padding, and unremarkable tools collapse to a single line. */
  compact?: boolean
  /** The request is `In Transit`, so a pending pickup can actually be confirmed. */
  canPickUp?: boolean
}) {
  const { tone, detailTone, flag, flagTone, Icon, detail } = describe(tool, state, extra)
  const pill = compact && "px-1.5 py-0 text-[10px]"

  // Colour and an imperative carry what to *do* with the tool; the grey pill
  // beside it is only what Bubble holds in `statusNew`. Keeping those two
  // apart is what stops three "Available" tools from looking identical when
  // two of them have to be collected from a job site first.
  const badges = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {flag && <Badge className={cn("border-transparent", flagTone, pill)}>{flag}</Badge>}
      {tool.status && (
        <Badge variant="outline" className={cn("font-normal text-muted-foreground", pill)}>
          {tool.status}
        </Badge>
      )}
      {extra && <Badge variant="outline">Extra</Badge>}
    </div>
  )

  // Nothing to flag and no room to spare: name, where it sits and its status
  // on one line. Only a tool with something to say earns a second.
  if (compact && !state) {
    return (
      <li className={cn("flex items-center gap-2 rounded-md border border-l-4 px-2 py-1", tone)}>
        <span className="min-w-0 flex-1 truncate text-xs" title={`${tool.name} · ${tool.location}`}>
          {tool.name}
          <span className="text-muted-foreground"> · {tool.location}</span>
        </span>
        {badges}
      </li>
    )
  }

  return (
    <li
      className={cn(
        "flex flex-col rounded-md border border-l-4",
        compact ? "gap-1 px-2 py-1.5" : "gap-1.5 px-2.5 py-1.5",
        tone
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("min-w-0 flex-1 wrap-anywhere", compact ? "text-xs" : "text-sm")} title={tool.name}>
          {tool.name}
        </span>
        {badges}
      </div>

      <span className={cn("flex items-start gap-1.5", compact ? "text-[11px]" : "text-xs", detailTone)}>
        {Icon && <Icon className={cn("shrink-0", compact ? "mt-px size-3" : "mt-0.5 size-3.5")} />}
        <span className="min-w-0 flex-1 wrap-anywhere">{detail}</span>
      </span>

      {/* Both answers a driver can give at the stop, side by side: the tool is
          on the truck, or it isn't coming. Without the second one an
          uncollectable tool strands the whole request. */}
      {canPickUp && state === "pending-pickup" && (
        <div className="grid grid-cols-2 gap-1">
          <PickupToolButton
            requestId={requestId}
            toolId={tool.id}
            toolName={tool.name}
            location={tool.location}
            compact={compact}
          />
          <LeaveBehindButton
            requestId={requestId}
            toolId={tool.id}
            toolName={tool.name}
            location={tool.location}
            compact={compact}
          />
        </div>
      )}
    </li>
  )
}

/**
 * The row's whole appearance, from its trip state — no nested ternaries at the
 * call site. `flag` is the imperative the reader acts on; the left border is
 * the same verdict at a glance down a list of rows.
 */
function describe(tool: CandidateTool, state: ToolTripState | null, extra: boolean) {
  // The tool is at its destination. Both the request's own earlier trip and a
  // later one land here, so a `Partially Delivered` request reads as what it is
  // — some tools dropped, the rest still to go — rather than showing the
  // dropped ones as unavailable because `Delivered` isn't a dispatchable status.
  if (state === "delivered" || state === "returned") {
    return {
      tone: "border-status-ok/40 border-l-status-ok bg-status-ok/10",
      detailTone: "text-status-ok-foreground",
      flag: state === "delivered" ? "Delivered" : "Returned",
      flagTone: "bg-status-ok text-white",
      Icon: PackageCheckIcon,
      detail:
        state === "delivered"
          ? `Already delivered to ${tool.location} — nothing left to move`
          : `Already back at ${tool.location} — nothing left to move`,
    }
  }

  if (state === "carried") {
    return {
      tone: "border-status-ok/40 border-l-status-ok bg-status-ok/10",
      detailTone: "text-status-ok-foreground",
      flag: "On the truck",
      flagTone: "bg-status-ok text-white",
      Icon: TruckIcon,
      detail: `Already collected — in the vehicle with ${tool.location}`,
    }
  }

  if (state === "pending-pickup") {
    return {
      tone: "border-status-active/40 border-l-status-active bg-status-active/10",
      detailTone: "text-status-active-foreground",
      flag: "Pick up",
      flagTone: "bg-status-active text-white",
      Icon: MapPinIcon,
      detail: `Not at the warehouse — collect from ${tool.location}${tool.floor ? `, floor ${tool.floor}` : ""} on the way`,
    }
  }

  if (state === "left-behind") {
    // Attention, not destructive: the tool is fine and exactly where it should
    // be. What's notable is that this trip went without it.
    return {
      tone: "border-status-attention/40 border-l-status-attention bg-status-attention/10",
      detailTone: "text-status-attention-foreground",
      flag: "Not picked up",
      flagTone: "bg-status-attention text-white",
      Icon: PackageXIcon,
      detail: `Left at ${tool.location} — not collected on this trip`,
    }
  }

  if (state === "refused") {
    // The one state a tool can be in while looking completely ordinary in
    // Bubble: a refused delivery writes nothing to `tools` on the way out and
    // plain `Available` at `"Warehouse"` on the way back, so without this row
    // the yard cannot tell it from a tool that never went anywhere — and the
    // obvious next move is sending it back to the site that just said no.
    // Amber rather than destructive: the tool is fine, the delivery isn't.
    return {
      tone: "border-status-attention/40 border-l-status-attention bg-status-attention/10",
      detailTone: "text-status-attention-foreground",
      flag: "Refused",
      flagTone: "bg-status-attention text-white",
      Icon: UndoIcon,
      detail: isWarehouseLocation(tool.location)
        ? `The site turned it away — back at ${tool.location}, still to deliver`
        : `The site turned it away — on its way back with ${tool.location}`,
    }
  }

  if (state === "not-ready") {
    return {
      tone: "border-destructive/40 border-l-destructive bg-destructive/10",
      detailTone: "text-destructive",
      flag: "Unavailable",
      flagTone: "bg-destructive text-white",
      Icon: TriangleAlertIcon,
      detail: `Out on another request, at ${tool.location}`,
    }
  }

  return {
    tone: "border-l-border bg-background",
    detailTone: "text-muted-foreground",
    flag: null,
    flagTone: "",
    Icon: null,
    detail: extra
      ? `${tool.typeName ?? "No type"} · ${tool.location}`
      : `${tool.location}${tool.floor ? ` · Floor ${tool.floor}` : ""}`,
  }
}
