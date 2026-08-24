"use client"

import { useMemo, useState } from "react"
import { MinusIcon, PlusIcon, SearchIcon } from "lucide-react"

import type { ToolType } from "@/lib/bubble/reference-types"
import type { ToolLine } from "@/lib/bubble/tools-summary"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"

/**
 * Picking tool *types* with quantities, not individual tools.
 *
 * Nothing is written to Bubble while this is open — the selection lives here
 * until the form is submitted, so abandoning the page leaves the database
 * untouched. That matters because the old Bubble UI does the opposite: it
 * stages the selection in `user.tempTools`, and abandoned rows accumulate.
 */
export function ToolPicker({
  toolTypes,
  selected,
  onChange,
}: {
  toolTypes: ToolType[]
  selected: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  const [query, setQuery] = useState("")

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return toolTypes
    return toolTypes.filter((type) => type.name.toLowerCase().includes(needle))
  }, [toolTypes, query])

  function step(name: string, by: number) {
    const next = { ...selected }
    const quantity = (next[name] ?? 0) + by
    if (quantity <= 0) delete next[name]
    else next[name] = Math.min(quantity, 99)
    onChange(next)
  }

  const chosen = Object.keys(selected).length

  return (
    <div className="flex flex-col gap-3">
      <InputGroup>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tools"
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      {chosen > 0 && (
        <p className="text-sm text-muted-foreground">
          {chosen} tool {chosen === 1 ? "type" : "types"} selected
        </p>
      )}

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No tools match</EmptyTitle>
            <EmptyDescription>
              Try a different search, or switch the job type to widen the list.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto rounded-lg border p-1">
          {visible.map((type) => {
            const quantity = selected[type.name] ?? 0
            return (
              <Item
                key={type.id}
                size="sm"
                variant={quantity > 0 ? "muted" : "default"}
              >
                <ItemContent>
                  <ItemTitle>
                    {type.name}
                    {type.consumable && (
                      <Badge variant="secondary">Consumable</Badge>
                    )}
                  </ItemTitle>
                  {type.notes && (
                    <ItemDescription>{type.notes}</ItemDescription>
                  )}
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Remove one ${type.name}`}
                    disabled={quantity === 0}
                    onClick={() => step(type.name, -1)}
                  >
                    <MinusIcon />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">
                    {quantity}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Add one ${type.name}`}
                    onClick={() => step(type.name, 1)}
                  >
                    <PlusIcon />
                  </Button>
                </ItemActions>
              </Item>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** The selection in the order the summary string will carry it. */
export function toolLinesOf(selected: Record<string, number>): ToolLine[] {
  return Object.entries(selected)
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
