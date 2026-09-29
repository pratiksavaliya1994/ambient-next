"use client"

import { PackageIcon, WarehouseIcon } from "lucide-react"

import { CargoSectionLabel } from "@/components/cargo-kind"
import { TripMaterialList } from "@/components/trip-material-row"
import { TripMovementRow } from "@/components/trip-movement-row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { WAREHOUSE_JOB_NAMES } from "@/lib/bubble/enums"
import type { OutstandingMaterial } from "@/lib/trips/material-movement-types"
import type { RequestMovements } from "@/lib/trips/movement-types"
import { cn } from "@/lib/utils"

/**
 * One request's outstanding tools and material lines, as a group in the pool.
 *
 * The header carries the thing the old board could never say: **"3 of 8 still
 * to go"**. A request that sent five tools on Monday is not finished and not
 * unstarted, and this is where that reads honestly.
 *
 * A **pickup** group also carries a destination `Select`. That is the single
 * asymmetry between the two directions: a delivery is going to its own job by
 * definition, while a pickup is going to *a* warehouse and someone has to say
 * which. Everything downstream is direction-agnostic because this resolves it.
 *
 * Material lines sit under the tools, headed "Materials". A group can hold
 * only lines — a materials-only request still renders.
 */
export function TripMovementGroup({
  group,
  selectedIds,
  materialQty,
  destination,
  journeys,
  onToggle,
  onToggleMaterial,
  onMaterialQtyChange,
  onToggleAll,
  onDestinationChange,
}: {
  group: RequestMovements
  selectedIds: ReadonlySet<string>
  /** `lineId → qty for this trip`. */
  materialQty: ReadonlyMap<string, number>
  destination: string
  /** `toolId → where the current selection really sends it`. See `TripMovementRow`. */
  journeys: ReadonlyMap<string, string>
  onToggle: (toolId: string, checked: boolean) => void
  onToggleMaterial: (line: OutstandingMaterial, checked: boolean) => void
  onMaterialQtyChange: (lineId: string, qty: number) => void
  onToggleAll: (checked: boolean) => void
  onDestinationChange: (warehouse: string) => void
}) {
  const selectable = group.movements.filter((movement) => movement.block === null)
  const allSelected =
    selectable.length + group.materials.length > 0 &&
    selectable.every((movement) => selectedIds.has(movement.toolId)) &&
    group.materials.every((line) => materialQty.has(line.lineId))

  // Each request is its own card, edged in its direction's colour, so a pool
  // scanned twenty tools deep still reads as "this request, then that one".
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-l-4 bg-card shadow-sm",
        group.direction === "pickup" ? "border-l-pickup" : "border-l-delivery"
      )}
    >
      <GroupHeader
        group={group}
        destination={destination}
        canToggle={selectable.length + group.materials.length > 0}
        allSelected={allSelected}
        onToggleAll={onToggleAll}
        onDestinationChange={onDestinationChange}
      />

      {group.movements.length > 0 && (
        <div className="flex flex-col gap-1 p-2">
          <CargoSectionLabel kind="tool" count={group.movements.length} />
          <ul className="flex flex-col gap-1">
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
        </div>
      )}

      <TripMaterialList
        materials={group.materials}
        quantities={materialQty}
        onToggle={onToggleMaterial}
        onQtyChange={onMaterialQtyChange}
      />
    </section>
  )
}

/**
 * Stacked rather than side-by-side: the pool column is narrow on purpose, so
 * the job name gets the full width and the controls get their own line.
 */
function GroupHeader({
  group,
  destination,
  canToggle,
  allSelected,
  onToggleAll,
  onDestinationChange,
}: {
  group: RequestMovements
  destination: string
  canToggle: boolean
  allSelected: boolean
  onToggleAll: (checked: boolean) => void
  onDestinationChange: (warehouse: string) => void
}) {
  const lineCount = group.materials.length

  return (
    <header
      className={cn(
        "flex flex-col gap-1.5 border-b px-2.5 py-2",
        group.direction === "pickup" ? "bg-card-pickup" : "bg-card-delivery"
      )}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 gap-1 bg-background px-1.5 py-0 text-[10px] font-medium",
            group.direction === "pickup" ? "text-pickup-foreground" : "text-delivery-foreground"
          )}
        >
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
          disabled={!canToggle}
          onClick={() => onToggleAll(!allSelected)}
        >
          {allSelected ? "Clear" : "All"}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {group.start ? newYorkDayLabel(group.start) : "No date"}
        {group.timeRange ? ` · ${group.timeRange}` : ""}
        {group.total > 0 && ` · ${group.total - group.landed} of ${group.total} still to go`}
        {group.unfilledSlots > 0 && ` · ${group.unfilledSlots} unfilled`}
        {lineCount > 0 && ` · ${lineCount} ${lineCount === 1 ? "material" : "materials"} to send`}
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
  )
}
