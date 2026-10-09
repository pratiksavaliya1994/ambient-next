"use client"

import * as React from "react"

import { ToolsDashboardFilters, type DashboardFilterOptions } from "@/components/tools-dashboard-filters"
import { LocationCard } from "@/components/tools-location-card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { useAutoScroll } from "@/hooks/use-auto-scroll"
import { NO_LOCATION, type DashboardTool } from "@/lib/bubble/pickup-tools-types"
import { Button } from "./ui/button"
import { Maximize2, Minimize2 } from "lucide-react"
import {
  conditionOf,
  EMPTY_DASHBOARD_FILTERS,
  filterDashboard,
  optionsOf,
  statusOf,
  typeOf,
  type DashboardFilters,
} from "@/lib/tools/dashboard-filters"
import { TOOL_STATUS_IN_TRANSIT } from "@/lib/bubble/tool-enums"

/**
 * Locations that are a driver, not a site. Dispatch writes `location = driver`
 * alongside `statusNew = In Transit`, so any location holding an `In Transit`
 * tool is a truck. Blank locations are never a driver.
 */
function driverLocationsOf(tools: DashboardTool[]): Set<string> {
  return new Set(
    tools
      .filter((tool) => tool.status === TOOL_STATUS_IN_TRANSIT && tool.location !== NO_LOCATION)
      .map((tool) => tool.location)
  )
}

export function useFullscreen<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  React.useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement === ref.current)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const toggle = React.useCallback(() => {
    const node = ref.current
    if (!node) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      node.requestFullscreen().catch(() => {
        // Request can be denied, or unsupported (e.g. iOS Safari on non-video elements).
      })
    }
  }, [])

  return { ref, isFullscreen, toggle } as const
}

export function ToolsDashboard({
  tools,
  jobIds = {},
}: {
  tools: DashboardTool[]
  /** `location → jobs._id`, for each card's title link. A location missing here renders unlinked. */
  jobIds?: Record<string, string>
}) {
  const locations = React.useMemo(() => {
    const names = new Set(tools.map((tool) => tool.location))
    const real = [...names].filter((name) => name !== NO_LOCATION).sort()
    return names.has(NO_LOCATION) ? [...real, NO_LOCATION] : real
  }, [tools])

  const options = React.useMemo<DashboardFilterOptions>(
    () => ({
      sites: locations,
      types: optionsOf(tools, typeOf),
      statuses: optionsOf(tools, statusOf),
      conditions: optionsOf(tools, conditionOf),
    }),
    [tools, locations]
  )

  // Nothing picked on any axis means "all", so first load shows every site.
  const [filters, setFilters] = React.useState<DashboardFilters>(EMPTY_DASHBOARD_FILTERS)
  const { ref: fsRef, isFullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>()
  useAutoScroll(fsRef, isFullscreen)

  const grouped = React.useMemo(() => filterDashboard(tools, locations, filters), [tools, locations, filters])
  // Read off the unfiltered list, so a status filter can't flip a driver's card back to a site's look.
  const driverLocations = React.useMemo(() => driverLocationsOf(tools), [tools])

  return (
    <div
      className={
        isFullscreen ? "flex h-full w-full flex-col gap-3 overflow-auto bg-background p-4" : "flex flex-col gap-3"
      }
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <ToolsDashboardFilters options={options} filters={filters} onFiltersChange={setFilters} />
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

      {grouped.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyTitle>No tools match</EmptyTitle>
            <EmptyDescription>
              {filters.query
                ? "No tool matches that search and the other filters."
                : "No tool matches these filters. Loosen or clear them to see more."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div ref={fsRef} className={isFullscreen ? "h-full w-full overflow-y-auto bg-background pt-8" : undefined}>
          <div className="columns-3xs gap-1.5">
            {grouped.map((group) => (
              <div key={group.location} className="mb-1.5 break-inside-avoid">
                <LocationCard
                  location={group.location}
                  tools={group.tools}
                  isExtra={group.isExtra}
                  isDriver={driverLocations.has(group.location)}
                  jobId={jobIds[group.location]}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
