"use client"

import * as React from "react"

import { MultiSelectFilter } from "@/components/multi-select-filter"
import { ToolNameSearch } from "@/components/tool-name-search"
import { Button } from "@/components/ui/button"
import { EMPTY_WAREHOUSE_FILTERS, hasWarehouseFilters, type WarehouseFilters } from "@/lib/tools/warehouse-filters"

export type WarehouseFilterOptions = Pick<WarehouseFilters, "types" | "statuses" | "conditions" | "shelves">

type ListAxis = keyof WarehouseFilterOptions

/** Toolbar order; `noun` fills the "All …" placeholder and the empty text. */
const AXES: { key: ListAxis; label: string; noun: string }[] = [
  { key: "types", label: "Tool type", noun: "types" },
  { key: "statuses", label: "Status", noun: "statuses" },
  { key: "conditions", label: "Condition", noun: "conditions" },
  { key: "shelves", label: "Shelf / bin", noun: "shelves / bins" },
]

/**
 * The Warehouse dashboard's toolbar — the tool-name search plus one
 * multi-select per filter axis, same rules as the Job Dashboard's: every axis
 * starts empty, which means "all".
 *
 * An axis whose loaded tools hold only one value can't narrow anything, so
 * it's hidden until the data gives it a second value — unless something is
 * already picked on it, so a live filter never disappears out from under the
 * user.
 */
export function WarehouseDashboardFilters({
  options,
  filters,
  onFiltersChange,
}: {
  options: WarehouseFilterOptions
  filters: WarehouseFilters
  onFiltersChange: (next: WarehouseFilters) => void
}) {
  const [searchInput, setSearchInput] = React.useState("")

  function clearAll() {
    setSearchInput("")
    onFiltersChange(EMPTY_WAREHOUSE_FILTERS)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <ToolNameSearch
        value={searchInput}
        onValueChange={setSearchInput}
        onSearch={(query) => onFiltersChange({ ...filters, query })}
        hasSearch={filters.query.length > 0}
      />
      {AXES.filter(({ key }) => options[key].length > 1 || filters[key].length > 0).map(({ key, label, noun }) => (
        <MultiSelectFilter
          key={key}
          ariaLabel={label}
          placeholder={`All ${noun}`}
          emptyText={`No ${noun} match.`}
          options={options[key]}
          value={filters[key]}
          onValueChange={(next) => onFiltersChange({ ...filters, [key]: next })}
        />
      ))}
      {hasWarehouseFilters(filters) && (
        <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
