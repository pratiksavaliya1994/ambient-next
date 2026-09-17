"use client"

import * as React from "react"

import { ToolsDashboardFilters } from "@/components/tools-dashboard-filters"
import { LocationCard } from "@/components/tools-location-card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { NO_LOCATION, type DashboardTool } from "@/lib/bubble/pickup-tools-types"
import { Button } from "./ui/button"
import { Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "tools-dashboard:locations"

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

function readStoredLocations(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []
  } catch {
    return []
  }
}

function writeStoredLocations(locations: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locations))
  } catch {
    // Private browsing / quota — losing persistence isn't worth surfacing.
  }
}

export function ToolsDashboard({ tools }: { tools: DashboardTool[] }) {
  const locations = React.useMemo(() => {
    const names = new Set(tools.map((tool) => tool.location))
    const real = [...names].filter((name) => name !== NO_LOCATION).sort()
    return names.has(NO_LOCATION) ? [...real, NO_LOCATION] : real
  }, [tools])

  const [selected, setSelected] = React.useState<string[]>([])
  const [committedSearch, setCommittedSearch] = React.useState("")
  const { ref: fsRef, isFullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>()

  // Reading the saved selection needs `localStorage`, which doesn't exist
  // during server rendering — there's no way to know it while rendering, so
  // this one-time sync happens after mount rather than being derived inline.
  React.useEffect(() => {
    const locationSet = new Set(locations)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(readStoredLocations().filter((location) => locationSet.has(location)))
    // Only ever needs to run once, against whatever `locations` is on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateSelected(next: string[]) {
    setSelected(next)
    writeStoredLocations(next)
  }

  const selectedSet = React.useMemo(() => new Set(selected), [selected])

  const grouped = React.useMemo(() => {
    const query = committedSearch.toLowerCase()
    const byLocation = new Map<string, DashboardTool[]>()
    for (const tool of tools) {
      // With no active search, only selected locations show. Once a query is
      // committed it searches every tool regardless of selection, so a match
      // in an unselected location still surfaces — its card is flagged below.
      if (query) {
        if (!tool.name.toLowerCase().includes(query)) continue
      } else if (!selectedSet.has(tool.location)) {
        continue
      }
      const bucket = byLocation.get(tool.location)
      if (bucket) bucket.push(tool)
      else byLocation.set(tool.location, [tool])
    }
    return locations
      .filter((location) => byLocation.has(location))
      .map((location) => ({
        location,
        tools: byLocation.get(location)!,
        isExtra: query.length > 0 && !selectedSet.has(location),
      }))
  }, [tools, selectedSet, locations, committedSearch])

  return (
    <div
      className={
        isFullscreen ? "flex h-full w-full flex-col gap-3 overflow-auto bg-background p-4" : "flex flex-col gap-3"
      }
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <ToolsDashboardFilters
            locations={locations}
            selected={selected}
            onSelectedChange={updateSelected}
            onSearch={setCommittedSearch}
            hasSearch={committedSearch.length > 0}
          />
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
            <EmptyTitle>{committedSearch ? "No tools match" : "No locations selected"}</EmptyTitle>
            <EmptyDescription>
              {committedSearch
                ? "No tool name matches that search, in any location."
                : "Pick one or more locations above to see their tools."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div ref={fsRef} className={isFullscreen ? "h-full w-full overflow-y-auto bg-background pt-8" : undefined}>
          <div className="columns-3xs gap-1.5">
            {grouped.map((group) => (
              <div key={group.location} className="mb-1.5 break-inside-avoid">
                <LocationCard location={group.location} tools={group.tools} isExtra={group.isExtra} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
