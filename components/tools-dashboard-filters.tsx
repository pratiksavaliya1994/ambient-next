"use client"

import * as React from "react"

import { MultiSelectFilter } from "@/components/multi-select-filter"
import { ToolNameSearch } from "@/components/tool-name-search"
import { Button } from "@/components/ui/button"
import {
  EMPTY_DASHBOARD_FILTERS,
  hasDashboardFilters,
  LOCATION_KINDS,
  type DashboardFilters,
} from "@/lib/tools/dashboard-filters"

export type DashboardFilterOptions = {
  sites: string[]
  types: string[]
  statuses: string[]
  conditions: string[]
}

/**
 * The Job Dashboard's toolbar — one multi-select per filter axis plus the
 * tool-name search. Every axis starts empty, which means "all": the dashboard
 * opens on every site.
 *
 * The live keystroke state lives here rather than in the dashboard: only the
 * *committed* query changes what's rendered, and filtering on a committed
 * query scans every tool, so it mustn't re-run per keystroke.
 */
export function ToolsDashboardFilters({
  options,
  filters,
  onFiltersChange,
}: {
  options: DashboardFilterOptions
  filters: DashboardFilters
  onFiltersChange: (next: DashboardFilters) => void
}) {
  const [searchInput, setSearchInput] = React.useState("")

  function set<K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) {
    onFiltersChange({ ...filters, [key]: value })
  }

  function clearAll() {
    setSearchInput("")
    onFiltersChange(EMPTY_DASHBOARD_FILTERS)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <MultiSelectFilter
        ariaLabel="Sites"
        placeholder="All sites / jobs"
        emptyText="No sites match."
        options={options.sites}
        value={filters.sites}
        onValueChange={(next) => set("sites", next)}
        className="min-w-72"
      />
      <ToolNameSearch
        value={searchInput}
        onValueChange={setSearchInput}
        onSearch={(query) => set("query", query)}
        hasSearch={filters.query.length > 0}
      />
      <MultiSelectFilter
        ariaLabel="Location kind"
        placeholder="All location kinds"
        emptyText="No kinds match."
        options={LOCATION_KINDS}
        value={filters.kinds}
        onValueChange={(next) => set("kinds", next)}
      />
      <MultiSelectFilter
        ariaLabel="Tool type"
        placeholder="All types"
        emptyText="No types match."
        options={options.types}
        value={filters.types}
        onValueChange={(next) => set("types", next)}
      />
      <MultiSelectFilter
        ariaLabel="Status"
        placeholder="All statuses"
        emptyText="No statuses match."
        options={options.statuses}
        value={filters.statuses}
        onValueChange={(next) => set("statuses", next)}
      />
      <MultiSelectFilter
        ariaLabel="Condition"
        placeholder="All conditions"
        emptyText="No conditions match."
        options={options.conditions}
        value={filters.conditions}
        onValueChange={(next) => set("conditions", next)}
      />
      {hasDashboardFilters(filters) && (
        <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
