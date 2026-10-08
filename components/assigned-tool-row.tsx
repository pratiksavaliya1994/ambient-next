import { LeaveBehindButton } from "@/components/leave-behind-button"
import { PickupToolButton } from "@/components/pickup-tool-button"
import { TRIP_STATE_LOOK, TripStateRow } from "@/components/trip-state-row"
import { Badge } from "@/components/ui/badge"
import { warehouseSpotOf, type CandidateTool } from "@/lib/bubble/assigned-tools-types"
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
  const pill = compact && "px-1.5 py-0 text-[10px]"

  // Colour and an imperative carry what to *do* with the tool; the grey pill
  // beside it is only what Bubble holds in `statusNew`. Keeping those two
  // apart is what stops three "Available" tools from looking identical when
  // two of them have to be collected from a job site first.
  const badges = (
    <>
      {tool.status && (
        <Badge variant="outline" className={cn("font-normal text-muted-foreground", pill)}>
          {tool.status}
        </Badge>
      )}
      {extra && <Badge variant="outline">Extra</Badge>}
    </>
  )

  // Nothing to flag and no room to spare: name, where it sits and its status
  // on one line. Only a tool with something to say earns a second.
  if (compact && !state) {
    const where = [tool.location, warehouseSpotOf(tool)].filter(Boolean).join(" · ")
    return (
      <li className={cn("flex items-center gap-2 rounded-md border border-l-4 px-2 py-1", TRIP_STATE_LOOK.none.tone)}>
        <span className="min-w-0 flex-1 truncate text-xs" title={`${tool.name} · ${where}`}>
          {tool.name}
          <span className="text-muted-foreground"> · {where}</span>
        </span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{badges}</div>
      </li>
    )
  }

  return (
    <TripStateRow
      state={state}
      title={<span title={tool.name}>{tool.name}</span>}
      detail={detailFor(tool, state, extra)}
      badges={badges}
      compact={compact}
    >
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
    </TripStateRow>
  )
}

/**
 * The row's detail line, from its trip state. How each state *looks* is
 * `TRIP_STATE_LOOK`, shared with the request page's material lines; only the
 * words are the tool's own.
 */
function detailFor(tool: CandidateTool, state: ToolTripState | null, extra: boolean): string {
  switch (state) {
    // The tool is at its destination. Both the request's own earlier trip and
    // a later one land here, so a `Partially Delivered` request reads as what
    // it is — some tools dropped, the rest still to go — rather than showing
    // the dropped ones as unavailable because `Delivered` isn't dispatchable.
    case "delivered":
      return `Already delivered to ${tool.location} — nothing left to move`
    case "returned":
      return `Already back at ${tool.location} — nothing left to move`
    case "carried":
      return `Already collected — in the vehicle with ${tool.location}`
    case "pending-pickup":
      return `Not at the warehouse — collect from ${tool.location}${tool.floor ? `, floor ${tool.floor}` : ""} on the way`
    // Attention, not destructive: the tool is fine and exactly where it should
    // be. What's notable is that this trip went without it.
    case "left-behind":
      return `Left at ${tool.location} — not collected on this trip`
    // The one state a tool can be in while looking completely ordinary in
    // Bubble: a refused delivery writes nothing to `tools` on the way out and
    // plain `Available` at `"Warehouse"` on the way back, so without this row
    // the yard cannot tell it from a tool that never went anywhere — and the
    // obvious next move is sending it back to the site that just said no.
    // Amber rather than destructive: the tool is fine, the delivery isn't.
    case "refused":
      return isWarehouseLocation(tool.location)
        ? `The site turned it away — back at ${tool.location}, still to deliver`
        : `The site turned it away — on its way back with ${tool.location}`
    case "not-ready":
      return `Out on another request, at ${tool.location}`
    default:
      return [
        extra ? (tool.typeName ?? "No type") : null,
        tool.location,
        !extra && tool.floor ? `Floor ${tool.floor}` : null,
        warehouseSpotOf(tool),
      ]
        .filter(Boolean)
        .join(" · ")
  }
}
