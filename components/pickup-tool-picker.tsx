"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"

import { DEFAULT_PICKUP_TOOL_STATUS, TOOL_STATUS, type ToolStatus } from "@/lib/bubble/enums"
import type { PickupTool } from "@/lib/bubble/pickup-tools"
import type { ToolStatusUpdate } from "@/lib/bubble/tool-status-updates"
import type { ToolLine } from "@/lib/bubble/tools-summary"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, EmptyMedia } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

/**
 * Picking individual physical tools for a job, not tool *types* with
 * quantities — `toolLinesOfPickup` below always writes a quantity of 1.
 *
 * `tools`/`loading` come from the parent: the job's tools are fetched fresh
 * when a job is picked (see `PickupRequestForm`), not preloaded like
 * Delivery's `toolstype` catalogue, since which units are actually on site
 * changes between visits. Unlike Delivery's 112-row catalogue this list is
 * only ever one job's tools, so it sits inline in the card rather than behind
 * a dialog.
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

/** Every tool checked, each seeded at the default pickup status — "Select all" and the Cleanup toggle share this. */
export function selectionOfTools(tools: PickupTool[]): Map<string, PickupSelection> {
  return new Map(
    tools.map((tool) => [
      tool.id,
      {
        id: tool.id,
        name: tool.name,
        status: DEFAULT_PICKUP_TOOL_STATUS,
        originalStatus: tool.status,
      },
    ])
  )
}

export function PickupToolPicker({
  tools,
  loading,
  hasJob,
  selected,
  onChange,
}: {
  tools: PickupTool[]
  loading: boolean
  hasJob: boolean
  selected: Map<string, PickupSelection>
  onChange: (next: Map<string, PickupSelection>) => void
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

  if (!hasJob) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No job picked</EmptyTitle>
          <EmptyDescription>Pick a job to see the tools on file there.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (loading) {
    return (
      <Empty className="border py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>Loading tools…</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  if (tools.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No tools on file</EmptyTitle>
          <EmptyDescription>Nothing is recorded at this job — add materials instead.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <InputGroup>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools"
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      {visible.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyTitle>No tools match</EmptyTitle>
            <EmptyDescription>Try a different search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="max-h-88 gap-1 overflow-y-auto rounded-lg border p-1">
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
                <Item
                  size="sm"
                  variant={checked ? "muted" : "default"}
                  className={cn("cursor-pointer flex-nowrap", checked && "ring-1 ring-primary/40")}
                >
                  <Checkbox
                    className="shrink-0"
                    checked={checked}
                    onCheckedChange={(next) => setChecked(tool, next === true)}
                    aria-label={tool.name}
                  />
                  {/* `min-w-0` + `truncate`: `ItemTitle` is `w-fit` by default, so a long
                      tool name would otherwise push the status control off the row. */}
                  <ItemContent className="min-w-0" onClick={() => setChecked(tool, !checked)}>
                    <ItemTitle className="w-full truncate" title={tool.name}>
                      {tool.name}
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions className="shrink-0" onClick={(event) => event.stopPropagation()}>
                    {checked ? (
                      <Select
                        items={TOOL_STATUS.map((value) => ({ label: value, value }))}
                        value={selection.status}
                        onValueChange={(next) => setStatus(tool.id, next as ToolStatus)}
                      >
                        <SelectTrigger size="sm" className="w-40 overflow-hidden">
                          <SelectValue className="truncate" />
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
                      <span className="w-40 truncate text-right text-xs text-muted-foreground">{tool.status}</span>
                    )}
                  </ItemActions>
                </Item>
              </React.Fragment>
            )
          })}
        </ItemGroup>
      )}
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
