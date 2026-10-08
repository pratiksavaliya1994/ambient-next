import {
  MapPinIcon,
  PackageCheckIcon,
  PackageXIcon,
  TriangleAlertIcon,
  TruckIcon,
  UndoIcon,
  type LucideIcon,
} from "lucide-react"
import type * as React from "react"

import { Badge } from "@/components/ui/badge"
import type { ToolTripState } from "@/lib/dispatch/tool-state"
import { cn } from "@/lib/utils"

type StateLook = { tone: string; detailTone: string; flag: string | null; flagTone: string; Icon: LucideIcon | null }

const OK = {
  tone: "border-status-ok/40 border-l-status-ok bg-status-ok/10",
  detailTone: "text-status-ok-foreground",
  flagTone: "bg-status-ok text-white",
}
const ATTENTION = {
  tone: "border-status-attention/40 border-l-status-attention bg-status-attention/10",
  detailTone: "text-status-attention-foreground",
  flagTone: "bg-status-attention text-white",
}

/**
 * How each trip state looks, for tools and material lines alike — the one
 * table both read so a tool and a bag of cement in the same state can't drift
 * apart. Green is landed or on the truck, blue is a collect still to make,
 * amber is a trip that failed it, red is a conflict. `null` is the plain row.
 */
export const TRIP_STATE_LOOK: Record<ToolTripState | "none", StateLook> = {
  delivered: { ...OK, flag: "Delivered", Icon: PackageCheckIcon },
  returned: { ...OK, flag: "Returned", Icon: PackageCheckIcon },
  carried: { ...OK, flag: "On the truck", Icon: TruckIcon },
  "pending-pickup": {
    tone: "border-status-active/40 border-l-status-active bg-status-active/10",
    detailTone: "text-status-active-foreground",
    flagTone: "bg-status-active text-white",
    flag: "Pick up",
    Icon: MapPinIcon,
  },
  "left-behind": { ...ATTENTION, flag: "Not picked up", Icon: PackageXIcon },
  refused: { ...ATTENTION, flag: "Refused", Icon: UndoIcon },
  "not-ready": {
    tone: "border-destructive/40 border-l-destructive bg-destructive/10",
    detailTone: "text-destructive",
    flagTone: "bg-destructive text-white",
    flag: "Unavailable",
    Icon: TriangleAlertIcon,
  },
  none: { tone: "border-l-border bg-background", detailTone: "text-muted-foreground", flag: null, flagTone: "", Icon: null },
}

/**
 * The shell of one row in a trip-state list: title and badges on top, a
 * coloured detail line under it, then whatever actions the caller passes.
 * `AssignedToolRow` and the request page's material lines both render through
 * it. `badges` sit after the state flag — a tool's `statusNew`, say.
 */
export function TripStateRow({
  state,
  title,
  detail,
  badges,
  compact = false,
  children,
}: {
  state: ToolTripState | null
  title: React.ReactNode
  detail: React.ReactNode
  badges?: React.ReactNode
  compact?: boolean
  children?: React.ReactNode
}) {
  const { tone, detailTone, flag, flagTone, Icon } = TRIP_STATE_LOOK[state ?? "none"]
  const pill = compact && "px-1.5 py-0 text-[10px]"

  return (
    <li
      className={cn(
        "flex flex-col rounded-md border border-l-4",
        compact ? "gap-1 px-2 py-1.5" : "gap-1.5 px-2.5 py-1.5",
        tone
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("min-w-0 flex-1 wrap-anywhere", compact ? "text-xs" : "text-sm")}>{title}</span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {flag && <Badge className={cn("border-transparent", flagTone, pill)}>{flag}</Badge>}
          {badges}
        </div>
      </div>

      <span className={cn("flex items-start gap-1.5", compact ? "text-[11px]" : "text-xs", detailTone)}>
        {Icon && <Icon className={cn("shrink-0", compact ? "mt-px size-3" : "mt-0.5 size-3.5")} />}
        <span className="min-w-0 flex-1 wrap-anywhere">{detail}</span>
      </span>

      {children}
    </li>
  )
}
