import Link from "next/link"
import * as React from "react"

import { ToolStatusDots } from "@/components/tool-status-badges"
import type { PickupTool } from "@/lib/bubble/pickup-tools-types"

/** What a line needs — a `PickupTool`, plus the holder when the read has it
 *  (`DashboardTool` does, `listToolsForJob` doesn't). */
export type ListedTool = PickupTool & { currentUser?: string | null }

type TypeGroup<T extends ListedTool> = { typeName: string; tools: T[] }

export type GroupedTools<T extends ListedTool> = { groups: TypeGroup<T>[]; singles: T[] }

const byName = (a: ListedTool, b: ListedTool) => a.name.localeCompare(b.name)

/**
 * A tool type holding two or more units becomes a group with one micro-header,
 * so its name is written once instead of once per unit — the saving this whole
 * density pass is built on.
 *
 * A type holding a single unit gains nothing from that: a header plus one row
 * is the two lines we're trying to remove. Those fall through to `singles`,
 * which render one per line with the type inline instead, and sit after the
 * groups so the list doesn't alternate between headed blocks and bare rows.
 * A tool with no `type` link at all is a single by definition.
 */
export function groupToolsByType<T extends ListedTool>(tools: readonly T[]): GroupedTools<T> {
  const byType = new Map<string, T[]>()
  const singles: T[] = []

  for (const tool of tools) {
    if (!tool.typeName) {
      singles.push(tool)
      continue
    }
    const bucket = byType.get(tool.typeName)
    if (bucket) bucket.push(tool)
    else byType.set(tool.typeName, [tool])
  }

  const groups: TypeGroup<T>[] = []
  for (const [typeName, group] of byType) {
    if (group.length === 1) singles.push(group[0])
    else groups.push({ typeName, tools: group.sort(byName) })
  }

  groups.sort((a, b) => a.typeName.localeCompare(b.typeName))
  singles.sort((a, b) => (a.typeName ?? "").localeCompare(b.typeName ?? "") || byName(a, b))

  return { groups, singles }
}

/**
 * The dense by-type tool list: headed groups, then singles with the type
 * inline. Takes `groupToolsByType`'s output rather than the tools so a client
 * caller (the Job Dashboard's `LocationCard`) can memoise the grouping.
 * Shared by that card and the job site page.
 */
export function ToolTypeList({ groups, singles }: GroupedTools<ListedTool>) {
  return (
    <>
      {groups.map((group) => (
        <React.Fragment key={group.typeName}>
          <TypeHeader typeName={group.typeName} count={group.tools.length} />
          {group.tools.map((tool) => (
            <ToolLine key={tool.id} tool={tool} />
          ))}
        </React.Fragment>
      ))}
      {singles.map((tool) => (
        <ToolLine key={tool.id} tool={tool} showType />
      ))}
    </>
  )
}

/** Everything the one-line row drops, back on hover — floor and holder are
 *  gone from the layout, not from the data. */
function toolTooltip(tool: ListedTool): string {
  return [
    tool.name,
    tool.typeName,
    tool.floor && `Floor ${tool.floor}`,
    tool.currentUser,
    tool.status,
    tool.condition && tool.condition !== "Ok" ? tool.condition : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** `sticky` so the type you're looking at stays named while a long list
 *  scrolls; `bg-card` rather than a translucent blur, which would cost a
 *  compositing layer on every one of the dozens of cards on screen. */
function TypeHeader({ typeName, count }: { typeName: string; count: number }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-card px-1 pt-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase first:pt-0">
      <span className="truncate" title={typeName}>
        {typeName}
      </span>
      <span className="h-px flex-1 bg-border" />
      <span className="tabular-nums opacity-70">{count}</span>
    </div>
  )
}

/**
 * One tool, one line. `min-w-0` + `truncate` on the name is the whole trick —
 * a flex item's automatic `min-width` otherwise refuses to shrink below
 * min-content and the status would be pushed off the row.
 */
function ToolLine({ tool, showType = false }: { tool: ListedTool; showType?: boolean }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs hover:bg-muted/60"
      title={toolTooltip(tool)}
    >
      <Link href={`/tools/${tool.id}`} className="min-w-0 flex-1 truncate hover:text-primary hover:underline">
        {tool.name}
      </Link>
      {showType && tool.typeName && (
        <span className="max-w-[45%] shrink-0 truncate text-[10px] text-muted-foreground">{tool.typeName}</span>
      )}
      <ToolStatusDots status={tool.status} condition={tool.condition} />
    </div>
  )
}
