"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import { MinusIcon, PlusIcon, SearchIcon, WrenchIcon, XIcon } from "lucide-react"

import type { ToolType } from "@/lib/bubble/reference-types"
import type { ToolLine } from "@/lib/bubble/tools-summary"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"

/**
 * Picking tool *types* with quantities, not individual tools.
 *
 * Nothing is written to Bubble while this is open — the selection lives here
 * until the form is submitted, so abandoning the page leaves the database
 * untouched. That matters because the old Bubble UI does the opposite: it
 * stages the selection in `user.tempTools`, and abandoned rows accumulate.
 *
 * The catalogue is 112 rows, so it lives in a dialog rather than inline: the
 * form page is a two-column layout and a scrolling list of a hundred items
 * inside it buried everything below it. What stays on the page is the
 * selection itself — see `SelectedTools`.
 */
export function ToolPickerDialog({
  toolTypes,
  selected,
  onChange,
  toDo,
  catalogueSize,
  trigger,
}: {
  toolTypes: ToolType[]
  selected: Record<string, number>
  onChange: (next: Record<string, number>) => void
  toDo: string
  catalogueSize: number
  trigger: React.ReactElement
}) {
  const [query, setQuery] = useState("")

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return toolTypes
    return toolTypes.filter((type) => type.name.toLowerCase().includes(needle))
  }, [toolTypes, query])

  const chosen = Object.keys(selected).length

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add tools</DialogTitle>
          <DialogDescription>
            {toolTypes.length} of {catalogueSize} tool types are offered for {toDo}.
          </DialogDescription>
        </DialogHeader>

        <InputGroup>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools"
            autoFocus
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>

        {visible.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No tools match</EmptyTitle>
              <EmptyDescription>Try a different search, or switch the job type to widen the list.</EmptyDescription>
              {trigger}
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="-mx-1 flex-1 gap-1 overflow-y-auto px-1">
            {visible.map((type) => {
              const quantity = selected[type.name] ?? 0
              return (
                <Item key={type.id} size="sm" variant={quantity > 0 ? "muted" : "default"}>
                  <ItemContent>
                    <ItemTitle>
                      {type.name}
                      {type.consumable && <Badge variant="secondary">Consumable</Badge>}
                    </ItemTitle>
                    {type.notes && <ItemDescription>{type.notes}</ItemDescription>}
                  </ItemContent>
                  <ItemActions>
                    <Stepper name={type.name} quantity={quantity} selected={selected} onChange={onChange} />
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>
        )}

        <DialogFooter className="sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {chosen} tool {chosen === 1 ? "type" : "types"} selected
          </p>
          <DialogClose render={<Button type="button" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The selection, as it sits beside the form. This is the whole reason the
 * catalogue can move into a dialog: what a PM needs on screen while filling
 * the rest of the form in is what they have picked, not what they could pick.
 */
export function SelectedTools({
  selected,
  onChange,
}: {
  selected: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  const lines = toolLinesOf(selected)

  if (lines.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WrenchIcon />
          </EmptyMedia>
          <EmptyTitle>No tools yet</EmptyTitle>
        </EmptyHeader>
        <EmptyDescription>A request needs at least one tool type.</EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {lines.length} tool {lines.length === 1 ? "type" : "types"} selected
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>
          Clear all
        </Button>
      </div>
      <ItemGroup className="max-h-88 gap-1 overflow-y-auto rounded-lg border p-1">
        {lines.map((line) => (
          <Item key={line.name} size="sm" variant="muted">
            <ItemContent>
              <ItemTitle className="line-clamp-2">{line.name}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Stepper name={line.name} quantity={line.quantity} selected={selected} onChange={onChange} />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${line.name}`}
                onClick={() => {
                  const next = { ...selected }
                  delete next[line.name]
                  onChange(next)
                }}
              >
                <XIcon className="pointer-events-none font-bold text-red-500" />
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </div>
  )
}

function Stepper({
  name,
  quantity,
  selected,
  onChange,
}: {
  name: string
  quantity: number
  selected: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  function step(by: number) {
    const next = { ...selected }
    const wanted = (next[name] ?? 0) + by
    if (wanted <= 0) delete next[name]
    else next[name] = Math.min(wanted, 99)
    onChange(next)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Remove one ${name}`}
        disabled={quantity === 0}
        onClick={() => step(-1)}
      >
        <MinusIcon />
      </Button>
      <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
      <Button type="button" variant="outline" size="icon-sm" aria-label={`Add one ${name}`} onClick={() => step(1)}>
        <PlusIcon />
      </Button>
    </>
  )
}

/** The selection in the order the summary string will carry it. */
export function toolLinesOf(selected: Record<string, number>): ToolLine[] {
  return Object.entries(selected)
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
