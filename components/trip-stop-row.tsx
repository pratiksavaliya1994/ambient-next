import Link from "next/link"
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react"

import { Item, ItemContent, ItemTitle } from "@/components/ui/item"
import { StopNumber } from "@/components/stop-number"
import { TripToolList } from "@/components/trip-tool-list"
import type { DispatchRequestSummary } from "@/lib/dispatch/summary"
import { cn } from "@/lib/utils"

/**
 * One stop on a driver's trip — the timeline dot-and-connector column plus the
 * request itself. Shared by the read-only list (`trip-stop-list.tsx`) and the
 * draggable one (`trip-stop-sortable-list.tsx`) so reordering can't drift into
 * looking like a different screen.
 *
 * `editing` changes three things, all for the same reason: a drag must not
 * turn into a navigation or a write.
 *
 * - The `Item` renders as a plain `div` instead of a `Link`. An `<a>` is
 *   natively draggable, so the browser's own `dragstart` would fire underneath
 *   dnd-kit's pointer sensor and drag a link ghost across the card.
 * - `canPickUp` goes off, so a slipped tap can't fire `PickupToolButton`'s
 *   real Bubble write mid-drag.
 * - The "Complete delivery" affordance is hidden, since it points at a page
 *   this row no longer navigates to.
 */
export function TripStopRow({
  stop,
  position,
  isLast,
  editing = false,
}: {
  stop: DispatchRequestSummary
  /** 1-based index within this driver's card — not `stop.order`. See `StopNumber`. */
  position: number
  isLast: boolean
  editing?: boolean
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <StopNumber position={position} className="mt-1" />
        {!isLast && <span className="w-px flex-1 bg-muted-foreground/25" />}
      </div>
      <div className={cn("min-w-0 flex-1", !isLast && "pb-2")}>
        <Item
          variant="outline"
          size="sm"
          render={editing ? undefined : <Link href={`/requests/${stop.id}`} draggable={false} />}
        >
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate">{stop.job}</span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                {stop.toolCount} {stop.toolCount === 1 ? "tool" : "tools"}
              </span>
            </ItemTitle>
            <TripToolList requestId={stop.id} tools={stop.tools} canPickUp={!editing} />
            {stop.missing.length > 0 && (
              <div className="flex items-start gap-1.5 rounded-md bg-status-attention/15 px-2 py-1.5 text-xs text-status-attention-foreground">
                <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                <span className="min-w-0 wrap-anywhere">
                  <span className="font-medium">Not fully assigned</span> — missing{" "}
                  {stop.missing.map((line) => `${line.toolType} ×${line.short}`).join(", ")}
                </span>
              </div>
            )}
            {!editing && (
              <div className="flex items-center justify-end gap-0.5 py-1 text-xs font-medium text-primary">
                Complete delivery
                <ChevronRightIcon className="size-3.5" />
              </div>
            )}
          </ItemContent>
        </Item>
      </div>
    </div>
  )
}
