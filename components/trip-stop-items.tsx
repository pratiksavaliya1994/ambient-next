import { ArrowDownToLineIcon, ArrowUpFromLineIcon, UndoIcon } from "lucide-react"

import { TripStopItemLine, type StopItem, type StopItemTone } from "@/components/trip-stop-item-line"
import { dropOutcome } from "@/lib/bubble/trips-types"
import type { StopKind } from "@/lib/trips/plan-types"
import { cn } from "@/lib/utils"

/**
 * What happens at one stop, in two lists: **collect** and **drop**.
 *
 * Shared by the builder's preview and the run sheet, so a stop reads the same
 * whether it is being planned or driven. This pair is what replaced nested
 * pickups — the old screens hung a collect-from-elsewhere under the request it
 * served, which told a driver what a tool was *for* but never where to go.
 *
 * Each half is a **labelled block of one-line rows** rather than a strip of
 * pills: "Pick up" and "Drop off" are the two things a driver scans for, and as
 * plain text beside an icon they were indistinguishable from the tool names
 * under them.
 */
export function TripStopItems({
  collect,
  drop,
  refused = [],
  kind,
  className,
}: {
  collect: readonly StopItem[]
  drop: readonly StopItem[]
  /**
   * Tools this stop turned away. Optional because the builder's preview plans a
   * route that hasn't been driven yet, so nothing can have been refused on it.
   */
  refused?: readonly StopItem[]
  kind: StopKind
  className?: string
}) {
  if (collect.length === 0 && drop.length === 0 && refused.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing happens here.</p>
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {collect.length > 0 && <ItemBlock label="Pick up" Icon={ArrowUpFromLineIcon} tone="collect" items={collect} />}
      {drop.length > 0 && (
        <ItemBlock label={dropOutcome(kind).verb} Icon={ArrowDownToLineIcon} tone="drop" items={drop} />
      )}
      {/* Last, and after the drop it failed to be: the stop's work reads in the
          order it happened, ending with what didn't. */}
      {refused.length > 0 && (
        <ItemBlock label="Refused here" Icon={UndoIcon} tone="refused" items={refused} />
      )}
    </div>
  )
}

/** One half of a stop's work, under a heading loud enough to find at a glance. */
function ItemBlock({
  label,
  Icon,
  tone,
  items,
}: {
  label: string
  Icon: typeof ArrowUpFromLineIcon
  tone: StopItemTone
  items: readonly StopItem[]
}) {
  return (
    <section className="overflow-hidden rounded-md border">
      <header
        className={cn(
          "flex items-center gap-1.5 px-2 py-1",
          tone === "drop" && "bg-status-ok/15 text-status-ok-foreground",
          tone === "collect" && "bg-status-active/15 text-status-active-foreground",
          tone === "refused" && "bg-status-attention/15 text-status-attention-foreground"
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[11px] font-semibold tracking-wide uppercase">{label}</span>
        <span className="ml-auto text-[11px] font-medium tabular-nums">{items.length}</span>
      </header>
      <ul className="divide-y">
        {items.map((item) => (
          <TripStopItemLine key={item.toolId} item={item} tone={tone} />
        ))}
      </ul>
    </section>
  )
}
