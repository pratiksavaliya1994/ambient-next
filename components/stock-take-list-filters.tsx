"use client"

import { SearchIcon } from "lucide-react"

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { StockTakeTool } from "@/lib/tools/stock-take"

const ALL_TYPES = "__all__"

export function StockTakeListFilters({
  tools,
  query,
  onQueryChange,
  type,
  onTypeChange,
}: {
  tools: StockTakeTool[]
  query: string
  onQueryChange: (next: string) => void
  type: string
  onTypeChange: (next: string) => void
}) {
  const typeNames = [...new Set(tools.map((tool) => tool.typeName).filter((name): name is string => !!name))].sort(
    (a, b) => a.localeCompare(b)
  )
  const items = [{ label: "All types", value: ALL_TYPES }, ...typeNames.map((name) => ({ label: name, value: name }))]

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <InputGroup className="sm:flex-1">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search tool names"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </InputGroup>
      <Select
        items={items}
        value={type || ALL_TYPES}
        onValueChange={(next) => onTypeChange(next === ALL_TYPES || !next ? "" : (next as string))}
      >
        <SelectTrigger className="sm:w-64" aria-label="Filter by type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
