import { MapPinIcon, TriangleAlertIcon, TruckIcon } from "lucide-react"

import { PickupToolButton } from "@/components/pickup-tool-button"
import { Badge } from "@/components/ui/badge"
import type { CandidateTool } from "@/lib/bubble/assigned-tools-types"
import type { ToolTripState } from "@/lib/dispatch/summary"
import { cn } from "@/lib/utils"

/**
 * One physical tool, coloured by where it actually is right now
 * (`deriveTripStatus`). Shared by the request detail page's tools list, the
 * Dispatch board and Active trips, so a tool looks the same wherever it turns
 * up; `state` is `null` before a request is assigned and after it's delivered,
 * and the row falls back to the plain location line.
 *
 * A tool still sitting on another job site carries its own "Picked up" button
 * where that action is live (`canPickUp`), so the itinerary lives on the tools
 * themselves rather than in a separate list repeating them.
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

      {canPickUp && state === "pending-pickup" && (
        <PickupToolButton
          requestId={requestId}
          toolId={tool.id}
          toolName={tool.name}
          location={tool.location}
          compact={compact}
        />
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
