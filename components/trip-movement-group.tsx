"use client"

import { PackageIcon, WarehouseIcon } from "lucide-react"

import { TripMovementRow } from "@/components/trip-movement-row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { WAREHOUSE_JOB_NAMES } from "@/lib/bubble/enums"
import type { RequestMovements } from "@/lib/trips/movement-types"

/**
 * One request's outstanding tools, as a group in the pool.
 *
 * The header carries the thing the old board could never say: **"3 of 8 still
 * to go"**. A request that sent five tools on Monday is not finished and not
 * unstarted, and this is where that reads honestly.
 *
 * A **pickup** group also carries a destination `Select`. That is the single
 * asymmetry between the two directions: a delivery is going to its own job by
 * definition, while a pickup is going to *a* warehouse and someone has to say
 * which. Everything downstream is direction-agnostic because this resolves it.
 */
export function TripMovementGroup({
  group,
  selectedIds,
  destination,
  journeys,
  onToggle,
  onToggleAll,
  onDestinationChange,
}: {
  group: RequestMovements
  selectedIds: ReadonlySet<string>
  destination: string
  /** `toolId → where the current selection really sends it`. See `TripMovementRow`. */
  journeys: ReadonlyMap<string, string>
  onToggle: (toolId: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  onDestinationChange: (warehouse: string) => void
}) {
  const selectable = group.movements.filter((movement) => movement.block === null)
  const allSelected = selectable.length > 0 && selectable.every((movement) => selectedIds.has(movement.toolId))

  return (
    <section className="rounded-lg border">
      {/* Stacked rather than side-by-side: the pool column is narrow on purpose,
          so the job name gets the full width and the controls get their own line. */}
      <header className="flex flex-col gap-1.5 border-b bg-muted/30 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0 gap-1 px-1.5 py-0 text-[10px] font-normal">
            {group.direction === "pickup" ? <WarehouseIcon className="size-3" /> : <PackageIcon className="size-3" />}
            {group.direction === "pickup" ? "Pickup" : "Delivery"}
          </Badge>
          <p className="min-w-0 flex-1 truncate text-sm font-medium" title={group.job}>
            {group.job}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-1 h-6 shrink-0 px-1.5 text-xs"
            disabled={selectable.length === 0}
            onClick={() => onToggleAll(!allSelected)}
          >
            {allSelected ? "Clear" : "All"}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {group.start ? newYorkDayLabel(group.start) : "No date"}
          {group.timeRange ? ` · ${group.timeRange}` : ""}
          {` · ${group.total - group.landed} of ${group.total} still to go`}
          {group.unfilledSlots > 0 && ` · ${group.unfilledSlots} unfilled`}
        </p>

        {group.destinationIsChoosable && (
          <Select
            items={WAREHOUSE_JOB_NAMES.map((value) => ({ label: value, value }))}
            value={destination}
            onValueChange={(next) => next !== null && onDestinationChange(next)}
          >
            <SelectTrigger size="sm" className="w-full" aria-label={`Return ${group.job} tools to`}>
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent className="w-fit min-w-(--anchor-width)">
              <SelectGroup>
                {WAREHOUSE_JOB_NAMES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </header>

      <ul className="flex flex-col gap-1 p-2">
        {group.movements.map((movement) => (
          <TripMovementRow
            key={movement.toolId}
            movement={movement}
            destination={destination}
            journey={journeys.get(movement.toolId)}
            checked={selectedIds.has(movement.toolId)}
            onCheckedChange={(checked) => onToggle(movement.toolId, checked)}
          />
        ))}
      </ul>
    </section>
  )
}
