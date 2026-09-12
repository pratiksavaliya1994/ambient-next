"use client"

import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
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
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"

/**
 * The Tools dashboard's toolbar — location multi-select, tool-name search,
 * and the bulk selection buttons. Split out of `components/tools-dashboard.tsx`
 * to keep both that component and this one inside `CLAUDE.md`'s 100-line
 * ceiling.
 *
 * The live keystroke state lives here rather than in the dashboard: only the
 * *committed* query changes what's rendered, and filtering on a committed
 * query scans every tool rather than just the selected locations, so it
 * mustn't re-run per keystroke.
 */
export function ToolsDashboardFilters({
  locations,
  selected,
  onSelectedChange,
  onSearch,
  hasSearch,
}: {
  locations: string[]
  selected: string[]
  onSelectedChange: (next: string[]) => void
  onSearch: (query: string) => void
  hasSearch: boolean
}) {
  const anchor = useComboboxAnchor()
  const [searchInput, setSearchInput] = React.useState("")

  function runSearch(event: React.FormEvent) {
    event.preventDefault()
    onSearch(searchInput.trim())
  }

  function clearSearch() {
    setSearchInput("")
    onSearch("")
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <Combobox multiple items={locations} value={selected} onValueChange={(next) => onSelectedChange(next as string[])}>
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
            {hasSearch && (
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

      <Button type="button" variant="outline" size="sm" onClick={() => onSelectedChange(locations)}>
        Select all
      </Button>

      {selected.length > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onSelectedChange([])}>
          Clear
        </Button>
      )}
    </div>
  )
}
