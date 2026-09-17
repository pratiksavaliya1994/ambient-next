import { TriangleAlertIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Shared styling for `tools.statusNew` (flow) and `tools.condition`
 * (phase 3A) — split out of `components/tools-dashboard.tsx` once that file
 * hit its 300-line ceiling (`CLAUDE.md`'s size rules require the split before
 * finishing the change, not after).
 *
 * Two renderings, one vocabulary. `StatusBadge`/`ConditionBadge` are the
 * roomy pills for detail screens; `ToolStatusDots` is the dense form the
 * Tools dashboard packs onto a single-line tool row. Both read from the same
 * maps so the colour and wording can't drift apart.
 *
 * Status colour is a severity gradient, not a rainbow: green/blue read as
 * "fine" or "in flow", amber as "needs attention", orange/red as "broken" or
 * `Missing` (the app's existing destructive red). Anything outside these maps
 * falls back to a plain neutral.
 */
type StatusStyle = {
  /** Tinted pill background + text, for `StatusBadge`. */
  badge: string
  /** Solid fill for the dense dot. */
  dot: string
  /** Text colour beside that dot. */
  text: string
  /** Abbreviated label — a one-line dashboard row has no room for "Pickup
   *  Requested". The full value stays in the row's `title` tooltip. */
  short: string
}

const STATUS_STYLE: Record<string, StatusStyle> = {
  Available: {
    badge: "border-transparent bg-status-ok/15 text-status-ok-foreground",
    dot: "bg-status-ok",
    text: "text-status-ok-foreground",
    short: "Avail",
  },
  Delivered: {
    badge: "border-transparent bg-status-ok/15 text-status-ok-foreground",
    dot: "bg-status-ok",
    text: "text-status-ok-foreground",
    short: "Delivered",
  },
  "In Transit": {
    badge: "border-transparent bg-status-active/15 text-status-active-foreground",
    dot: "bg-status-active",
    text: "text-status-active-foreground",
    short: "Transit",
  },
  "Pickup Requested": {
    badge: "border-transparent bg-status-active/15 text-status-active-foreground",
    dot: "bg-status-active",
    text: "text-status-active-foreground",
    short: "Pickup",
  },
  Missing: {
    badge: "border-transparent bg-destructive/15 text-destructive",
    dot: "bg-destructive",
    text: "text-destructive",
    short: "Missing",
  },
}

const NEUTRAL = {
  badge: "border-transparent bg-muted text-muted-foreground",
  dot: "bg-muted-foreground",
  text: "text-muted-foreground",
}

/** An unrecognised status keeps its raw text rather than being hidden — a
 *  value outside the option set is data worth seeing, not a rendering bug. */
function statusStyle(status: string): StatusStyle {
  return STATUS_STYLE[status] ?? { ...NEUTRAL, short: status }
}

/**
 * `tools.condition` — most of the non-`Ok` display texts `TOOL_STATUS_NEW`
 * used to carry, reusing the same colour ramp so the vocabulary and severity
 * read identically to before the phase 3A split. `Repair Required` stays
 * mapped for old rows still holding it even though `TOOL_CONDITION` no longer
 * offers it (see `lib/bubble/tool-enums.ts`). `Retired` has no entry and falls
 * back to `NEUTRAL` — permanently out of service isn't a severity, so it gets
 * no warning colour.
 */
const CONDITION_STYLE: Record<string, Pick<StatusStyle, "badge" | "text">> = {
  "Maintenance Required": {
    badge: "border-transparent bg-status-attention/15 text-status-attention-foreground",
    text: "text-status-attention-foreground",
  },
  "Inspection Required": {
    badge: "border-transparent bg-status-attention/15 text-status-attention-foreground",
    text: "text-status-attention-foreground",
  },
  "Repair Required": {
    badge: "border-transparent bg-status-repair/15 text-status-repair-foreground",
    text: "text-status-repair-foreground",
  },
  "Under Repair": {
    badge: "border-transparent bg-status-repair/15 text-status-repair-foreground",
    text: "text-status-repair-foreground",
  },
  Missing: {
    badge: "border-transparent bg-destructive/15 text-destructive",
    text: "text-destructive",
  },
}

function conditionStyle(condition: string) {
  return CONDITION_STYLE[condition] ?? NEUTRAL
}

/** A condition worth drawing attention to: anything set that isn't healthy. */
function isNotable(condition: string): boolean {
  return Boolean(condition) && condition !== "Ok"
}

/** `tools.statusNew`. Renders nothing for a blank status. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  if (!status) return null
  return <Badge className={cn(statusStyle(status).badge, className)}>{status}</Badge>
}

/**
 * `tools.condition`. Renders nothing for a blank condition or `Ok` — a
 * healthy tool needs no second badge, only an unhealthy one calls for
 * attention alongside its flow status.
 */
export function ConditionBadge({ condition, className }: { condition: string; className?: string }) {
  if (!isNotable(condition)) return null
  return <Badge className={cn(conditionStyle(condition).badge, className)}>{condition}</Badge>
}

/**
 * The dense pair, for the Tools dashboard's one-line rows: a status dot with
 * an abbreviated label, and — only when the condition is notable — a tinted
 * warning glyph. A glyph rather than a second dot keeps the two unambiguous
 * at a glance, and costs almost no width; hovering the row reveals the full
 * text of both.
 *
 * `status` is `tools.statusNew`, backfilled on every row — a blank one is a
 * row the migration missed, and an empty dot would read as a style bug rather
 * than as missing data, so it renders nothing at all.
 */
export function ToolStatusDots({ status, condition }: { status: string; condition: string }) {
  const style = status ? statusStyle(status) : null

  return (
    <>
      {style && (
        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[11px] leading-none font-medium", style.text)}>
          <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
          {style.short}
        </span>
      )}
      {isNotable(condition) && (
        <TriangleAlertIcon
          aria-label={condition}
          className={cn("size-3 shrink-0", conditionStyle(condition).text)}
        />
      )}
    </>
  )
}
