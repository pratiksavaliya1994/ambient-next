"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import { SearchIcon, WrenchIcon, XIcon } from "lucide-react"

import { DEFAULT_PICKUP_TOOL_STATUS, TOOL_STATUS, type ToolStatus } from "@/lib/bubble/enums"
import type { PickupTool } from "@/lib/bubble/pickup-tools"
import type { ToolStatusUpdate } from "@/lib/bubble/tool-status-updates"
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
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

/**
 * Picking individual physical tools for a job, not tool *types* with
 * quantities — `SelectedPickupTools` below always writes a quantity of 1.
 *
 * `tools`/`loading` come from the parent: the job's tools are fetched fresh
 * every time this opens (see `PickupRequestForm`), not preloaded like
 * Delivery's `toolstype` catalogue, since which units are actually on site
 * changes between visits.
 *
 * Selection is keyed by tool id, not name — writing a status change back to
 * Bubble needs the `tools` row's `_id`. Checking a tool seeds its status at
 * `DEFAULT_PICKUP_TOOL_STATUS` ("Ready for Pickup"); the picker then lets it
 * be changed further. `originalStatus` (the status Bubble had on fetch) rides
 * along so `changedStatusLines` can tell which tools actually need a write.
 */
export type PickupSelection = {
  id: string
  name: string
  status: ToolStatus
  /** The status Bubble had on fetch — not necessarily one of `TOOL_STATUS`, only ever compared against, never written. */
  originalStatus: string
}

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
  selected: Map<string, PickupSelection>
  onChange: (next: Map<string, PickupSelection>) => void
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

  function setChecked(tool: PickupTool, checked: boolean) {
    const next = new Map(selected)
    if (checked) {
      next.set(tool.id, {
        id: tool.id,
        name: tool.name,
        status: DEFAULT_PICKUP_TOOL_STATUS,
        originalStatus: tool.status,
      })
    } else {
      next.delete(tool.id)
    }
    onChange(next)
  }

  function setStatus(toolId: string, status: ToolStatus) {
    const current = selected.get(toolId)
    if (!current) return
    const next = new Map(selected)
    next.set(toolId, { ...current, status })
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
              const selection = selected.get(tool.id)
              const checked = selection !== undefined
              const previous = visible[index - 1]
              const showGroupLabel = tool.typeName && tool.typeName !== previous?.typeName
              return (
                <React.Fragment key={tool.id}>
                  {showGroupLabel && (
                    <p className="px-2 pt-2 text-xs font-medium text-muted-foreground">{tool.typeName}</p>
                  )}
                  <Item size="sm" variant={checked ? "muted" : "default"} className="cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => setChecked(tool, next === true)}
                      aria-label={tool.name}
                    />
                    <ItemContent onClick={() => setChecked(tool, !checked)}>
                      <ItemTitle>{tool.name}</ItemTitle>
                    </ItemContent>
                    <ItemActions onClick={(event) => event.stopPropagation()}>
                      {checked ? (
                        <Select
                          items={TOOL_STATUS.map((value) => ({ label: value, value }))}
                          value={selection.status}
                          onValueChange={(next) => setStatus(tool.id, next as ToolStatus)}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {TOOL_STATUS.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{tool.status}</span>
                      )}
                    </ItemActions>
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
  selected: Map<string, PickupSelection>
  onChange: (next: Map<string, PickupSelection>) => void
}) {
  const entries = [...selected.values()].sort((a, b) => a.name.localeCompare(b.name))

  if (entries.length === 0) {
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
          {entries.length} tool{entries.length === 1 ? "" : "s"} selected
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(new Map())}>
          Clear all
        </Button>
      </div>
      <ItemGroup className="max-h-88 gap-1 overflow-y-auto rounded-lg border p-1">
        {entries.map((entry) => (
          <Item key={entry.id} size="sm" variant="muted">
            <ItemContent>
              <ItemTitle className="line-clamp-2">{entry.name}</ItemTitle>
              <ItemDescription>{entry.status}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${entry.name}`}
                onClick={() => {
                  const next = new Map(selected)
                  next.delete(entry.id)
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
export function toolLinesOfPickup(selected: Map<string, PickupSelection>): ToolLine[] {
  return [...selected.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({ name: entry.name, quantity: 1 }))
}

/** Only the tools whose status was actually changed from what Bubble had on fetch. */
export function changedStatusLines(selected: Map<string, PickupSelection>): ToolStatusUpdate[] {
  return [...selected.values()]
    .filter((entry) => entry.status !== entry.originalStatus)
    .map((entry) => ({ toolId: entry.id, status: entry.status }))
}
