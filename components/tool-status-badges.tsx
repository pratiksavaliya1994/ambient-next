import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Shared badge styling for `tools.statusNew` (flow) and `tools.condition`
 * (phase 3A) — split out of `components/tools-dashboard.tsx` once that file
 * hit its 300-line ceiling (`CLAUDE.md`'s size rules require the split before
 * finishing the change, not after). Also usable by `components/tool-row.tsx`,
 * which renders a status badge of its own today.
 *
 * Status colour is a severity gradient, not a rainbow: green/blue read as
 * "fine" or "in flow", amber as "needs attention", orange/red as "broken" or
 * `Missing` (the app's existing destructive red). Anything outside these maps
 * falls back to a plain neutral pill.
 */
const STATUS_BADGE_CLASSES: Record<string, string> = {
  Available: "border-transparent bg-status-ok/15 text-status-ok-foreground",
  Delivered: "border-transparent bg-status-ok/15 text-status-ok-foreground",
  "In Transit": "border-transparent bg-status-active/15 text-status-active-foreground",
  "Pickup Requested": "border-transparent bg-status-active/15 text-status-active-foreground",
  Missing: "border-transparent bg-destructive/15 text-destructive",
}
const DEFAULT_BADGE_CLASSES = "border-transparent bg-muted text-muted-foreground"

/**
 * `tools.condition` — the same five non-`Ok` display texts `TOOL_STATUS_NEW`
 * used to carry, reusing the same colour ramp so the vocabulary and severity
 * read identically to before the phase 3A split.
 */
const CONDITION_BADGE_CLASSES: Record<string, string> = {
  "Maintenance Required": "border-transparent bg-status-attention/15 text-status-attention-foreground",
  "Inspection Required": "border-transparent bg-status-attention/15 text-status-attention-foreground",
  "Repair Required": "border-transparent bg-status-repair/15 text-status-repair-foreground",
  "Under Repair": "border-transparent bg-status-repair/15 text-status-repair-foreground",
  Missing: "border-transparent bg-destructive/15 text-destructive",
}

/** `tools.statusNew`. Renders nothing for a blank status. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  if (!status) return null
  return <Badge className={cn(STATUS_BADGE_CLASSES[status] ?? DEFAULT_BADGE_CLASSES, className)}>{status}</Badge>
}

/**
 * `tools.condition`. Renders nothing for a blank condition or `Ok` — a
 * healthy tool needs no second badge, only an unhealthy one calls for
 * attention alongside its flow status.
 */
export function ConditionBadge({ condition, className }: { condition: string; className?: string }) {
  if (!condition || condition === "Ok") return null
  return (
    <Badge className={cn(CONDITION_BADGE_CLASSES[condition] ?? DEFAULT_BADGE_CLASSES, className)}>{condition}</Badge>
  )
}

/** Both badges together, in flow-then-condition order — the common case on the Tools dashboard. */
export function ToolStatusBadges({
  status,
  condition,
  className,
}: {
  status: string
  condition: string
  className?: string
}) {
  return (
    <>
      <StatusBadge status={status} className={className} />
      <ConditionBadge condition={condition} className={className} />
    </>
  )
}
