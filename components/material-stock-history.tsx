import { MapPinIcon, WarehouseIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { newYorkLabel } from "@/lib/bubble/dates"
import type { StockHistoryEntry, StockReason } from "@/lib/bubble/material-items-types"
import { cn } from "@/lib/utils"

/**
 * Which way the stock moved, and why, in the status tokens' severity ramp:
 * green for stock arriving (a supplier `Receive`, a trip's `Return`), blue for
 * stock going out to a request (`Assign`), amber for a closed request handing
 * back what it never shipped (`Release`), orange for a hand correction, and
 * plain for an `Unassign` — someone changing their mind.
 *
 * `Deliver` and `Collect` are site rows (5D, 5F): blue for units landing on a
 * job, plain for units leaving it.
 */
const REASON_STYLE: Record<StockReason, string> = {
  Receive: "bg-status-ok/15 text-status-ok-foreground",
  Return: "bg-status-ok/15 text-status-ok-foreground",
  Assign: "bg-status-active/15 text-status-active-foreground",
  Release: "bg-status-attention/15 text-status-attention-foreground",
  Adjust: "bg-status-repair/15 text-status-repair-foreground",
  Unassign: "bg-muted text-muted-foreground",
  Deliver: "bg-status-active/15 text-status-active-foreground",
  Collect: "bg-muted text-muted-foreground",
}

type HistoryContext = {
  /** `location → jobs._id`, so a site row links to its site page. A location missing here renders unlinked. */
  siteLinks?: ReadonlyMap<string, string>
  /** `materialId → unit`, for a history mixing items (a site's). Falls back to `unit`. */
  itemUnits?: ReadonlyMap<string, string>
  /** Name the item on each row — for a history mixing items. */
  showItem?: boolean
}

/**
 * `materialstockhistory` rows, newest first — one item's (warehouse and site
 * rows mixed) or one site's (items mixed).
 *
 * Every row names **where** its stock moved: "Warehouse" when `location` is
 * empty, else the site, linked to its page. `stockAfter` is that location's
 * figure, and is labelled so, since the item page mixes the two.
 */
export function MaterialStockHistory({
  entries,
  unit,
  emptyDescription = "Receipts, corrections and assignments will show up here.",
  ...context
}: HistoryContext & { entries: StockHistoryEntry[]; unit: string; emptyDescription?: string }) {
  if (entries.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No stock changes yet</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => (
        <StockHistoryItem
          key={entry.id}
          entry={entry}
          unit={context.itemUnits?.get(entry.materialId) ?? unit}
          {...context}
        />
      ))}
    </ol>
  )
}

function StockHistoryItem({ entry, unit, siteLinks, showItem }: HistoryContext & { entry: StockHistoryEntry; unit: string }) {
  return (
    <li className="relative border-l-2 border-muted pl-4">
      <span className="absolute top-3.5 -left-1.25 size-2 rounded-full bg-muted-foreground" />

      <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-muted-foreground">
          <span>{newYorkLabel(entry.createdAt)}</span>
          {entry.byName && <span>by {entry.byName}</span>}
        </div>

        {showItem && (
          <Link href={`/materials/${entry.materialId}`} className="w-fit text-sm font-medium hover:underline">
            {entry.materialName || "Unnamed material"}
          </Link>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge className={cn("border-transparent", REASON_STYLE[entry.reason])}>{entry.reason}</Badge>
          <span
            className={cn(
              "font-semibold tabular-nums",
              entry.delta > 0 ? "text-status-ok-foreground" : entry.delta < 0 && "text-destructive"
            )}
          >
            {entry.delta > 0 ? "+" : ""}
            {entry.delta} {unit}
          </span>
          {entry.stockAfter !== null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              → {entry.stockAfter} after, at this location
            </span>
          )}
        </div>

        <HistoryLocation location={entry.location} jobId={siteLinks?.get(entry.location)} />

        {entry.requestId && (
          <Link
            href={`/requests/${entry.requestId}`}
            className="w-fit text-xs text-foreground underline underline-offset-4"
          >
            View request
          </Link>
        )}
        {entry.notes && <p className="text-sm text-muted-foreground italic">{entry.notes}</p>}
      </div>
    </li>
  )
}

/** "Warehouse" for the yard (`location` empty), else the site — linked to its page when it matches a job. */
function HistoryLocation({ location, jobId }: { location: string; jobId?: string }) {
  if (!location) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <WarehouseIcon className="size-3.5 shrink-0" />
        Warehouse
      </span>
    )
  }

  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <MapPinIcon className="size-3.5 shrink-0" />
      {jobId ? (
        <Link href={`/materials/sites/${jobId}`} className="truncate text-foreground hover:underline" title={location}>
          {location}
        </Link>
      ) : (
        <span className="truncate" title={location}>
          {location}
        </span>
      )}
    </span>
  )
}
