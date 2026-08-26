"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import { SearchIcon, WrenchIcon, XIcon } from "lucide-react"

import type { PickupTool } from "@/lib/bubble/pickup-tools"
import type { ToolLine } from "@/lib/bubble/tools-summary"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"

/**
 * Picking individual physical tools for a job, not tool *types* with
 * quantities — `SelectedPickupTools` below always writes a quantity of 1.
 *
 * `tools`/`loading` come from the parent: the job's tools are fetched fresh
 * every time this opens (see `PickupRequestForm`), not preloaded like
 * Delivery's `toolstype` catalogue, since which units are actually on site
 * changes between visits.
 */
export function PickupToolPickerDialog({
  tools,
  loading,
  selected,
  onChange,
  onOpenChange,
  jobName,
  trigger,
}: {
  tools: PickupTool[]
  loading: boolean
  selected: Set<string>
  onChange: (next: Set<string>) => void
  onOpenChange: (open: boolean) => void
  jobName: string
  trigger: React.ReactElement
}) {
  const [query, setQuery] = useState("")

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return tools
    return tools.filter((tool) => tool.name.toLowerCase().includes(needle))
  }, [tools, query])

  function setChecked(name: string, checked: boolean) {
    const next = new Set(selected)
    if (checked) next.add(name)
    else next.delete(name)
    onChange(next)
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add tools</DialogTitle>
          <DialogDescription>Tools currently at {jobName}.</DialogDescription>
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

        {loading ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Spinner />
              </EmptyMedia>
              <EmptyTitle>Loading tools…</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No tools match</EmptyTitle>
              <EmptyDescription>
                {tools.length === 0 ? "No tools are on file at this job." : "Try a different search."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="-mx-1 flex-1 gap-1 overflow-y-auto px-1">
            {visible.map((tool, index) => {
              const checked = selected.has(tool.name)
              const previous = visible[index - 1]
              const showGroupLabel = tool.typeName && tool.typeName !== previous?.typeName
              return (
                <React.Fragment key={tool.id}>
                  {showGroupLabel && (
                    <p className="px-2 pt-2 text-xs font-medium text-muted-foreground">{tool.typeName}</p>
                  )}
                  <Item
                    size="sm"
                    variant={checked ? "muted" : "default"}
                    className="cursor-pointer"
                    onClick={() => setChecked(tool.name, !checked)}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => setChecked(tool.name, next === true)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={tool.name}
                    />
                    <ItemContent>
                      <ItemTitle>{tool.name}</ItemTitle>
                    </ItemContent>
                  </Item>
                </React.Fragment>
              )
            })}
          </ItemGroup>
        )}

        <DialogFooter className="sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {selected.size} tool{selected.size === 1 ? "" : "s"} selected
          </p>
          <DialogClose render={<Button type="button" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The selection, as it sits beside the form — same role as Delivery's `SelectedTools`. */
export function SelectedPickupTools({
  selected,
  onChange,
}: {
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const names = [...selected].sort((a, b) => a.localeCompare(b))

  if (names.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WrenchIcon />
          </EmptyMedia>
          <EmptyTitle>No tools yet</EmptyTitle>
        </EmptyHeader>
        <EmptyDescription>A pickup needs at least one tool or materials.</EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {names.length} tool{names.length === 1 ? "" : "s"} selected
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(new Set())}>
          Clear all
        </Button>
      </div>
      <ItemGroup className="max-h-88 gap-1 overflow-y-auto rounded-lg border p-1">
        {names.map((name) => (
          <Item key={name} size="sm" variant="muted">
            <ItemContent>
              <ItemTitle className="line-clamp-2">{name}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  const next = new Set(selected)
                  next.delete(name)
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

/** The selection in the order the summary string will carry it — always quantity 1. */
export function toolLinesOfPickup(selected: Set<string>): ToolLine[] {
  return [...selected].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, quantity: 1 }))
}
