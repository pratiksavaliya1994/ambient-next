"use client"

import * as React from "react"
import { LayersIcon, SearchIcon, TagIcon, XIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { NO_LOCATION, type DashboardTool } from "@/lib/bubble/pickup-tools-types"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "tools-dashboard:locations"

/** Cap on each card's tool list before it scrolls internally — a location
 *  can hold hundreds of tools, and an uncapped card would tower over the
 *  rest of the grid. */
const TOOL_LIST_MAX_HEIGHT = "max-h-[28rem]"

/**
 * Status colour is a severity gradient, not a rainbow: green/blue read as
 * "fine" or "in flow", amber as "needs attention", orange/red as "broken" or
 * `Missing` (the app's existing destructive red). Keyed on `TOOL_STATUS_NEW`
 * (`tools.statusNew`), not the old `status` field — see `lib/bubble/enums.ts`.
 * Anything outside this set falls back to a plain neutral pill.
 */
const STATUS_BADGE_CLASSES: Record<string, string> = {
  Available: "border-transparent bg-status-ok/15 text-status-ok-foreground",
  Delivered: "border-transparent bg-status-ok/15 text-status-ok-foreground",
  "In Transit": "border-transparent bg-status-active/15 text-status-active-foreground",
  "Pickup Requested": "border-transparent bg-status-active/15 text-status-active-foreground",
  "Maintenance Required": "border-transparent bg-status-attention/15 text-status-attention-foreground",
  "Inspection Required": "border-transparent bg-status-attention/15 text-status-attention-foreground",
  "Repair Required": "border-transparent bg-status-repair/15 text-status-repair-foreground",
  "Under Repair": "border-transparent bg-status-repair/15 text-status-repair-foreground",
  Missing: "border-transparent bg-destructive/15 text-destructive",
}
const DEFAULT_STATUS_CLASSES = "border-transparent bg-muted text-muted-foreground"

/** "Carlos Faner" → "CF"; a lone name falls back to its first two letters. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
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
  const anchor = useComboboxAnchor()

  const locations = React.useMemo(() => {
    const names = new Set(tools.map((tool) => tool.location))
    const real = [...names].filter((name) => name !== NO_LOCATION).sort()
    return names.has(NO_LOCATION) ? [...real, NO_LOCATION] : real
  }, [tools])

  const [selected, setSelected] = React.useState<string[]>([])
  // `searchInput` tracks every keystroke for the controlled input; `committedSearch`
  // only advances on submit (Enter or the search button) so filtering — which, once
  // a query is present, scans every tool rather than just the selected locations —
  // doesn't re-run on each keystroke.
  const [searchInput, setSearchInput] = React.useState("")
  const [committedSearch, setCommittedSearch] = React.useState("")

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

  function runSearch(event: React.FormEvent) {
    event.preventDefault()
    setCommittedSearch(searchInput.trim())
  }

  function clearSearch() {
    setSearchInput("")
    setCommittedSearch("")
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 border-b pb-6">
        <Combobox
          multiple
          items={locations}
          value={selected}
          onValueChange={(next) => updateSelected(next as string[])}
        >
          <ComboboxChips ref={anchor} className="min-w-72">
            <ComboboxValue>
              {(values: string[]) => (
                <>
                  {values.map((value) => (
                    <ComboboxChip key={value}>{value}</ComboboxChip>
                  ))}
                  <ComboboxChipsInput placeholder="Search locations…" />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No locations match.</ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <form onSubmit={runSearch} className="contents">
          <ButtonGroup className="min-w-72">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search tools by name…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {committedSearch && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton type="button" size="icon-xs" aria-label="Clear search" onClick={clearSearch}>
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </ButtonGroup>
        </form>

        <Button type="button" variant="outline" size="sm" onClick={() => updateSelected(locations)}>
          Select all
        </Button>

        {selected.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => updateSelected([])}>
            Clear
          </Button>
        )}
      </div>

      {grouped.length === 0 ? (
        <Empty className="border">
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] items-start gap-5">
          {grouped.map((group) => (
            <LocationCard key={group.location} location={group.location} tools={group.tools} isExtra={group.isExtra} />
          ))}
        </div>
      )}
    </div>
  )
}

function LocationCard({ location, tools, isExtra }: { location: string; tools: DashboardTool[]; isExtra: boolean }) {
  const isUnset = location === NO_LOCATION

  return (
    <Card className={cn("border", isExtra && "border-dashed border-primary/50")}>
      <CardHeader className="px-3">
        <div className="flex flex-col gap-1">
          <CardTitle className={cn("wrap-anywhere", isUnset && "text-muted-foreground italic")}>{location}</CardTitle>
          {isExtra && (
            <span className="text-xs font-normal text-muted-foreground">Match found outside your selection</span>
          )}
        </div>
        <CardAction>
          <Badge variant="secondary">{tools.length}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className={cn(TOOL_LIST_MAX_HEIGHT, "gap-1 overflow-y-auto px-2")}>
        {tools.map((tool) => (
          <ToolBox key={tool.id} tool={tool} />
        ))}
      </CardContent>
    </Card>
  )
}

function ToolBox({ tool }: { tool: DashboardTool }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium wrap-anywhere">{tool.name}</span>
        {/* `tool.status` is `tools.statusNew`, backfilled on every row — a blank
            one is a row the migration missed, and an empty pill would read as
            a style bug rather than as missing data. */}
        {tool.status && (
          <Badge className={STATUS_BADGE_CLASSES[tool.status] ?? DEFAULT_STATUS_CLASSES}>{tool.status}</Badge>
        )}
      </div>

      {(tool.typeName || tool.floor) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {tool.typeName && (
            <span className="inline-flex items-center gap-1">
              <TagIcon className="size-3" />
              {tool.typeName}
            </span>
          )}
          {tool.floor && (
            <span className="inline-flex items-center gap-1">
              <LayersIcon className="size-3" />
              Floor {tool.floor}
            </span>
          )}
        </div>
      )}

      {tool.currentUser && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Avatar size="sm">
            <AvatarFallback>{initials(tool.currentUser)}</AvatarFallback>
          </Avatar>
          {tool.currentUser}
        </div>
      )}
    </div>
  )
}
