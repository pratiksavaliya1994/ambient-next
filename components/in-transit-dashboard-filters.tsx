"use client"

import * as React from "react"

import { MultiSelectFilter } from "@/components/multi-select-filter"
import { ToolNameSearch } from "@/components/tool-name-search"
import { Button } from "@/components/ui/button"
import {
  EMPTY_IN_TRANSIT_FILTERS,
  hasInTransitFilters,
  type InTransitFilters,
} from "@/lib/trips/in-transit-filters"

type ListAxis = Exclude<keyof InTransitFilters, "query">

export type InTransitFilterOptions = Record<ListAxis, readonly string[]>

/** Toolbar order; `noun` fills the "All …" placeholder and the empty text. */
const AXES: { key: ListAxis; label: string; noun: string }[] = [
  { key: "drivers", label: "Driver", noun: "drivers" },
  { key: "kinds", label: "Tools or materials", noun: "tools & materials" },
  { key: "destinations", label: "Heading to", noun: "destinations" },
  { key: "origins", label: "Coming from", noun: "origins" },
  { key: "toolTypes", label: "Tool type", noun: "tool types" },
  { key: "conditions", label: "Condition", noun: "conditions" },
  { key: "states", label: "State", noun: "states" },
]

/**
 * The In Transit dashboard's toolbar — the Warehouse dashboard's rules: every
 * axis starts empty ("all"), and an axis the loaded items give only one value
 * is hidden until they give it a second, unless something is already picked
 * on it, so a live filter never disappears out from under the user.
 */
export function InTransitDashboardFilters({
  options,
  filters,
  onFiltersChange,
}: {
  options: InTransitFilterOptions
  filters: InTransitFilters
  onFiltersChange: (next: InTransitFilters) => void
}) {
  const [searchInput, setSearchInput] = React.useState("")

  function clearAll() {
    setSearchInput("")
    onFiltersChange(EMPTY_IN_TRANSIT_FILTERS)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <ToolNameSearch
        value={searchInput}
        onValueChange={setSearchInput}
        onSearch={(query) => onFiltersChange({ ...filters, query })}
        hasSearch={filters.query.length > 0}
        placeholder="Search tools or materials…"
      />
      {AXES.filter(({ key }) => options[key].length > 1 || filters[key].length > 0).map(({ key, label, noun }) => (
        <MultiSelectFilter
          key={key}
          ariaLabel={label}
          placeholder={`All ${noun}`}
          emptyText={`No ${noun} match.`}
          options={options[key]}
          value={filters[key] as string[]}
          onValueChange={(next) => onFiltersChange({ ...filters, [key]: next })}
        />
      ))}
      {hasInTransitFilters(filters) && (
        <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
