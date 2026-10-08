"use client"

import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"

/**
 * Tool-name search for the dashboards, committed on submit rather than per
 * keystroke — a committed query re-filters every tool, so it mustn't run on
 * each key. The keystroke state is the caller's, so a "Clear filters" there
 * can empty the box too.
 */
export function ToolNameSearch({
  value,
  onValueChange,
  onSearch,
  hasSearch,
  placeholder = "Search tools by name…",
}: {
  value: string
  onValueChange: (next: string) => void
  onSearch: (query: string) => void
  hasSearch: boolean
  placeholder?: string
}) {
  function runSearch(event: React.FormEvent) {
    event.preventDefault()
    onSearch(value.trim())
  }

  function clearSearch() {
    onValueChange("")
    onSearch("")
  }

  return (
    <form onSubmit={runSearch} className="contents">
      <ButtonGroup className="min-w-72">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={placeholder}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
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
  )
}
