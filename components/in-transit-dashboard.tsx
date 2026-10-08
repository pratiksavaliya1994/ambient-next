"use client"

import * as React from "react"
import { Maximize2, Minimize2 } from "lucide-react"

import { InTransitDashboardFilters, type InTransitFilterOptions } from "@/components/in-transit-dashboard-filters"
import { InTransitMasonryGrid } from "@/components/in-transit-masonry-grid"
import { useFullscreen } from "@/components/tools-dashboard"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { useAutoScroll } from "@/hooks/use-auto-scroll"
import { NO_DRIVER, type InTransitLoad } from "@/lib/trips/in-transit"
import {
  conditionOf,
  EMPTY_IN_TRANSIT_FILTERS,
  filterInTransit,
  groupByDriver,
  kindOf,
  optionsOf,
  originOf,
  stateOf,
  toolTypeOf,
  TRAILING_DESTINATIONS,
  type InTransitFilters,
} from "@/lib/trips/in-transit-filters"

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Same fullscreen idiom as `WarehouseDashboard` — the grid grows to fill the
 *  screen while fullscreen and scrolls itself, slowly, for a wall screen. */
export function InTransitDashboard({ load }: { load: InTransitLoad }) {
  const { items, trips } = load
  const options = React.useMemo<InTransitFilterOptions>(
    () => ({
      drivers: optionsOf(items, (item) => item.driver, [NO_DRIVER]),
      kinds: optionsOf(items, kindOf, []),
      destinations: optionsOf(items, (item) => item.destination, TRAILING_DESTINATIONS),
      origins: optionsOf(items, originOf),
      toolTypes: optionsOf(items, toolTypeOf),
      conditions: optionsOf(items, conditionOf),
      states: optionsOf(items, stateOf, []),
    }),
    [items]
  )

  // Nothing picked on any axis means "all", so first load shows every truck.
  const [filters, setFilters] = React.useState<InTransitFilters>(EMPTY_IN_TRANSIT_FILTERS)
  const groups = React.useMemo(() => groupByDriver(filterInTransit(items, filters)), [items, filters])
  const toolCount = groups.reduce((sum, group) => sum + group.toolCount, 0)
  const materialCount = groups.reduce((sum, group) => sum + group.materialCount, 0)
  const { ref: fsRef, isFullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>()
  useAutoScroll(fsRef, isFullscreen)

  return (
    <div
      className={
        isFullscreen ? "flex h-full w-full flex-col gap-3 overflow-auto bg-background p-4" : "flex flex-col gap-3"
      }
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <InTransitDashboardFilters options={options} filters={filters} onFiltersChange={setFilters} />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {plural(groups.length, "driver", "drivers")} · {plural(toolCount, "tool", "tools")} ·{" "}
        {plural(materialCount, "material", "materials")}
      </p>

      {groups.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyTitle>{items.length === 0 ? "Nothing on a truck" : "Nothing matches"}</EmptyTitle>
            <EmptyDescription>
              {items.length === 0
                ? "Once a driver starts a trip and loads something, it shows up here."
                : "Try clearing a filter."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div ref={fsRef} className={isFullscreen ? "h-full w-full overflow-y-auto bg-background pt-8" : undefined}>
          <InTransitMasonryGrid groups={groups} trips={trips} />
        </div>
      )}
    </div>
  )
}
