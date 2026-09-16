"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"

import { TOOL_CONDITION, type ToolCondition } from "@/lib/bubble/tool-enums"
import type { PickupTool } from "@/lib/bubble/pickup-tools"
import type { ToolConditionUpdate } from "@/lib/bubble/tool-status-updates"
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
 * Selection is keyed by tool id, not name — writing a condition change back
 * to Bubble needs the `tools` row's `_id`. Checking a tool keeps whatever
 * condition Bubble already has — picking a tool for pickup is not itself a
 * condition change; the picker then lets the condition be changed
 * deliberately. `originalCondition` (the condition Bubble had on fetch) rides
 * along so `changedConditionLines` can tell which tools actually need a
 * write.
 *
 * Phase 3A: this used to edit `tools.statusNew` directly. It now edits the
 * separate `tools.condition` field instead, and shows `statusNew` (the flow
 * state — `In Transit`, `Pickup Requested`, …) as read-only context so a PM
 * can see a tool is already mid-flow without the picker letting them touch
 * that field. See `docs/phase-3a-condition-split.md`.
 */
export type PickupSelection = {
  id: string
  name: string
  /**
   * Seeded from the tool's live Bubble condition, which is free text and so
   * not necessarily one of `TOOL_CONDITION`. Only a value picked in the
   * picker (always a `ToolCondition`) ever differs from `originalCondition`,
   * so only those are written.
   */
  condition: string
  /** The condition Bubble had on fetch — not necessarily one of `TOOL_CONDITION`, only ever compared against, never written. */
  originalCondition: string
  /** `tools.statusNew` at fetch time, shown read-only — the picker never writes this field. */
  status: string
}

/** Every tool checked, each keeping its current Bubble condition — "Select all" and the Cleanup toggle share this. */
export function selectionOfTools(tools: PickupTool[]): Map<string, PickupSelection> {
  return new Map(
    tools.map((tool) => [
      tool.id,
      {
        id: tool.id,
        name: tool.name,
        condition: tool.condition,
        originalCondition: tool.condition,
        status: tool.status,
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
        condition: tool.condition,
        originalCondition: tool.condition,
        status: tool.status,
      })
    } else {
      next.delete(tool.id)
    }
    onChange(next)
  }

  function setCondition(toolId: string, condition: string) {
    const current = selected.get(toolId)
    if (!current) return
    const next = new Map(selected)
    next.set(toolId, { ...current, condition })
    onChange(next)
  }

  if (!hasJob) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No job picked</EmptyTitle>
          <EmptyDescription>Pick a job to see the tools on the job.</EmptyDescription>
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
          <EmptyTitle>No tools on this job</EmptyTitle>
          <EmptyDescription>Nothing is recorded at this job — add materials instead.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <InputGroup>
        <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools" />
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
            /* `tools.condition` is free text, so a seeded condition can sit
               outside `TOOL_CONDITION` (blank rows included) — carry it as an
               extra option so the trigger shows the tool's real condition
               instead of nothing. */
            const conditionOptions =
              selection && selection.condition && !(TOOL_CONDITION as readonly string[]).includes(selection.condition)
                ? [selection.condition, ...TOOL_CONDITION]
                : TOOL_CONDITION
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
                      tool name would otherwise push the condition control off the row. */}
                  <ItemContent className="min-w-0" onClick={() => setChecked(tool, !checked)}>
                    <ItemTitle className="w-full truncate" title={tool.name}>
                      {tool.name}
                    </ItemTitle>
                    {/* Read-only — the picker edits `condition`, never `statusNew`.
                        Lets a PM see a tool is already `In Transit` or `Pickup
                        Requested` and not request it twice. */}
                    {tool.status && (
                      <span className="truncate text-xs text-muted-foreground">{tool.status}</span>
                    )}
                  </ItemContent>
                  <ItemActions className="shrink-0" onClick={(event) => event.stopPropagation()}>
                    {checked ? (
                      <Select
                        items={conditionOptions.map((value) => ({ label: value, value }))}
                        value={selection.condition}
                        onValueChange={(next) => next !== null && setCondition(tool.id, next)}
                      >
                        <SelectTrigger size="sm" className="w-40 overflow-hidden" aria-label={`Condition of ${tool.name}`}>
                          <SelectValue className="truncate" />
                        </SelectTrigger>
                        {/* The popup defaults to the trigger's width; the trigger is
                            narrow (`w-40`) to keep the row tight, which clips the
                            longer conditions ("Inspection Required"), so let the
                            popup size to its widest option instead. */}
                        <SelectContent className="w-fit min-w-(--anchor-width) max-w-(--available-width)">
                          <SelectGroup>
                            {conditionOptions.map((value) => (
                              <SelectItem key={value} value={value}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="w-40 truncate text-right text-xs text-muted-foreground">{tool.condition}</span>
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

/**
 * The selected tools' **ids** — what makes a pickup request's physical tools
 * survive the submit (phase 3B).
 *
 * Until this existed, a pickup persisted tool **names** only, via
 * `toolLinesOfPickup` → `requestedtools.toolsSummary`, and the ids were
 * consumed once by the condition fan-out and thrown away. Nothing downstream
 * could say which physical units a pickup named, so nothing could put them on
 * a trip.
 *
 * **Ids only, deliberately — no `{ toolId, extra, toolType }` objects.**
 * `new-pickup-request` fans `assign-request-tool` out over
 * `Search for tools (unique id is in toolIds)`, so each `assignedtools` row
 * takes its `toolType` from `This tools's name` **inside Bubble**, and `extra`
 * from a literal `no`. Both of the values an object would have carried are
 * therefore derived at write time from the row itself rather than trusted from
 * a browser that may have loaded its copy minutes ago — a rename between page
 * load and submit can't write a stale name, and neither can a forged POST.
 *
 * That `toolType` holds the physical tool's **name** is the field's documented
 * meaning, not a stretch of it: `toolType` is "the `toolsSummary` name from
 * this request this row fills", and for a pickup the summary entries *are*
 * physical tool names (`toolLinesOfPickup` maps `tool.name`). It is what lets
 * `buildSlots` line up for pickup with no new logic, so "3 of 5 collected"
 * falls out of the comparison delivery already renders. Do not "fix" the
 * Bubble side to a type name.
 */
export function toolIdsOfPickup(selected: Map<string, PickupSelection>): string[] {
  return [...selected.values()].sort((a, b) => a.name.localeCompare(b.name)).map((entry) => entry.id)
}

/** Only the tools whose condition was actually changed from what Bubble had on fetch. */
export function changedConditionLines(selected: Map<string, PickupSelection>): ToolConditionUpdate[] {
  return [...selected.values()]
    .filter((entry) => entry.condition !== entry.originalCondition)
    // Safe cast: a condition differing from `originalCondition` can only have
    // come from the picker's Select, which offers nothing but `TOOL_CONDITION`.
    .map((entry) => ({ toolId: entry.id, condition: entry.condition as ToolCondition }))
}
