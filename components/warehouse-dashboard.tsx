"use client"

import { Maximize2, Minimize2 } from "lucide-react"

import { useFullscreen } from "@/components/tools-dashboard"
import { WarehouseDashboardFilters } from "@/components/warehouse-dashboard-filters"
import { WarehouseMasonryGrid } from "@/components/warehouse-masonry-grid"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { WarehouseListParams, WarehouseTypeGroup } from "@/lib/tools/warehouse-filters"

/** Same fullscreen idiom as `ToolsDashboard` — the filter row keeps a
 *  toggle button alongside it, and the grid grows to fill the screen while
 *  fullscreen, scrolling internally rather than the page. */
export function WarehouseDashboard({
  current,
  groups,
  totalTools,
}: {
  current: WarehouseListParams
  groups: WarehouseTypeGroup[]
  totalTools: number
}) {
  const { ref: fsRef, isFullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>()

  return (
    <div
      className={
        isFullscreen ? "flex h-full w-full flex-col gap-3 overflow-auto bg-background p-4" : "flex flex-col gap-3"
      }
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <WarehouseDashboardFilters current={current} />
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
        {groups.length} {groups.length === 1 ? "type" : "types"} · {totalTools} {totalTools === 1 ? "tool" : "tools"}
      </p>

      {groups.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyTitle>No tools match</EmptyTitle>
            <EmptyDescription>Try clearing a filter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div ref={fsRef} className={isFullscreen ? "h-full w-full overflow-y-auto bg-background pt-8" : undefined}>
          <WarehouseMasonryGrid groups={groups} />
        </div>
      )}
    </div>
  )
}
