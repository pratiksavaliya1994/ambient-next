import { ArrowRightIcon, ImageIcon, MapPinIcon } from "lucide-react"

import { StatusBadge } from "@/components/tool-status-badges"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { newYorkLabel } from "@/lib/bubble/dates"
import type { ToolHistoryEntry } from "@/lib/bubble/tool-history"

function locationChanged(entry: ToolHistoryEntry): boolean {
  return entry.prevLocation !== entry.newLocation || entry.prevFloor !== entry.newFloor
}

function statusChanged(entry: ToolHistoryEntry): boolean {
  return entry.prevStatus !== entry.newStatus && Boolean(entry.prevStatus || entry.newStatus)
}

/**
 * Whether an entry has anything worth showing. `DB - Tools Change Log` fires
 * on *every* `tools` save, including ones where neither status nor location
 * actually moved (a condition-only edit, a re-save with the same values) —
 * those rows are real, but showing them as a bare "Updated" is noise, not
 * history, so they're dropped rather than rendered.
 */
function isMeaningful(entry: ToolHistoryEntry): boolean {
  return locationChanged(entry) || statusChanged(entry) || Boolean(entry.notes) || Boolean(entry.pictureUrl)
}

/**
 * The `toolshistory` audit trail, newest first — every location or status
 * change any writer of `tools` produced (this app, its Bubble workflows, or
 * the old Bubble UI), read via `listToolHistory`.
 */
export function ToolHistoryTimeline({ entries }: { entries: ToolHistoryEntry[] }) {
  const visible = entries.filter(isMeaningful)

  if (visible.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No history yet</EmptyTitle>
          <EmptyDescription>Location and status changes will show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ol className="flex flex-col gap-4">
      {visible.map((entry) => (
        <ToolHistoryItem key={entry.id} entry={entry} />
      ))}
    </ol>
  )
}

function LocationPill({ location, floor }: { location: string | null; floor: string | null }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <MapPinIcon className="size-3.5" />
      {location ?? "—"}
      {floor && ` · Floor ${floor}`}
    </Badge>
  )
}

function ToolHistoryItem({ entry }: { entry: ToolHistoryEntry }) {
  const movedLocation = locationChanged(entry)
  const movedStatus = statusChanged(entry)

  return (
    <li className="relative border-l-2 border-muted pl-4">
      <span className="absolute top-3.5 -left-1.25 size-2 rounded-full bg-muted-foreground" />

      <div className="rounded-lg border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-muted-foreground">
          <span>{newYorkLabel(entry.at)}</span>
          <span>by {entry.by}</span>
        </div>

        <div className="mt-1 flex flex-col gap-1.5 text-sm">
          {movedStatus && (
            <div className="flex flex-wrap items-center gap-1.5">
              {entry.prevStatus && <StatusBadge status={entry.prevStatus} />}
              {entry.prevStatus && entry.newStatus && (
                <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {entry.newStatus && <StatusBadge status={entry.newStatus} />}
            </div>
          )}

          {movedLocation && (
            <div className="flex flex-wrap items-center gap-1.5">
              <LocationPill location={entry.prevLocation} floor={entry.prevFloor} />
              <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <LocationPill location={entry.newLocation} floor={entry.newFloor} />
            </div>
          )}

          {entry.notes && <p className="text-muted-foreground italic">{entry.notes}</p>}

          {entry.pictureUrl && (
            <a
              href={entry.pictureUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-foreground underline underline-offset-4"
            >
              <ImageIcon className="size-3.5" />
              View photo
            </a>
          )}
        </div>
      </div>
    </li>
  )
}
