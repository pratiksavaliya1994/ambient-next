"use client"

import { LockIcon } from "lucide-react"
import * as React from "react"

import { StockTakeListFilters } from "@/components/stock-take-list-filters"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { StockTakeLocks, StockTakeTool } from "@/lib/tools/stock-take"

/**
 * Every tool, searchable and filterable by type, each with what its record
 * currently says. The bulk buttons act on what is *shown*, so "type = S26,
 * tick all shown" is how a shelf of one kind gets counted.
 *
 * A locked tool (`locks`) is listed with its reason but can't be ticked, and
 * the bulk buttons pass over it — the save would only skip it anyway.
 */
export function StockTakeToolList({
  tools,
  locks,
  location,
  selected,
  onChange,
}: {
  tools: StockTakeTool[]
  locks: StockTakeLocks
  location: string
  selected: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
}) {
  const [query, setQuery] = React.useState("")
  const [type, setType] = React.useState("")

  const needle = query.trim().toLowerCase()
  const visible = tools.filter(
    (tool) => (!needle || tool.name.toLowerCase().includes(needle)) && (!type || tool.typeName === type)
  )
  const tickable = (list: StockTakeTool[]) => list.filter((tool) => !locks[tool.id]).map((tool) => tool.id)
  const recordedHere = tickable(tools.filter((tool) => tool.location === location))
  const visibleTickable = tickable(visible)

  function setMany(ids: string[], checked: boolean) {
    const next = new Set(selected)
    for (const id of ids) {
      if (checked) next.add(id)
      else next.delete(id)
    }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <StockTakeListFilters tools={tools} query={query} onQueryChange={setQuery} type={type} onTypeChange={setType} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setMany(recordedHere, true)}>
          Tick the {recordedHere.length} recorded here
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMany(visibleTickable, true)}>
          Tick all {visibleTickable.length} shown
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMany(visible.map((tool) => tool.id), false)}>
          Untick shown
        </Button>
      </div>

      <ul className="flex max-h-[28rem] flex-col divide-y overflow-y-auto rounded-lg border">
        {visible.map((tool) => (
          <StockTakeToolRow
            key={tool.id}
            tool={tool}
            lock={locks[tool.id]}
            here={tool.location === location}
            checked={selected.has(tool.id)}
            onCheckedChange={(checked) => setMany([tool.id], checked)}
          />
        ))}
        {visible.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No tool matches.</li>}
      </ul>
    </div>
  )
}

function StockTakeToolRow({
  tool,
  lock,
  here,
  checked,
  onCheckedChange,
}: {
  tool: StockTakeTool
  /** Why it can't be ticked, if it can't. */
  lock: string | undefined
  here: boolean
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <li>
      <label
        className={cn(
          "flex items-start gap-3 px-3 py-2",
          lock ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50"
        )}
      >
        <Checkbox
          className="mt-0.5"
          checked={checked}
          disabled={lock !== undefined}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium wrap-anywhere">{tool.name}</span>
          <span className="text-xs text-muted-foreground wrap-anywhere">
            {tool.typeName ?? "No type"} · Recorded at {tool.location || "no location"}
          </span>
        </span>
        {lock && (
          <Badge variant="outline">
            <LockIcon className="size-3.5" />
            {lock}
          </Badge>
        )}
        {here && <Badge variant="secondary">Recorded here</Badge>}
      </label>
    </li>
  )
}
