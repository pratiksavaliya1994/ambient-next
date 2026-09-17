import Link from "next/link"
import * as React from "react"

import { ToolStatusDots } from "@/components/tool-status-badges"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NO_LOCATION, type DashboardTool } from "@/lib/bubble/pickup-tools-types"
import { cn } from "@/lib/utils"

/** Cap on each card's tool list before it scrolls internally. A location can
 *  hold hundreds of tools, and because the multi-column layout balances column
 *  heights, one uncapped card would set the height of *every* column. */
const TOOL_LIST_MAX_HEIGHT = "max-h-80"

type TypeGroup = { typeName: string; tools: DashboardTool[] }

const byName = (a: DashboardTool, b: DashboardTool) => a.name.localeCompare(b.name)

/**
 * A tool type holding two or more units becomes a group with one micro-header,
 * so its name is written once instead of once per unit — the saving this whole
 * density pass is built on.
 *
 * A type holding a single unit gains nothing from that: a header plus one row
 * is the two lines we're trying to remove. Those fall through to `singles`,
 * which render one per line with the type inline instead, and sit after the
 * groups so the card doesn't alternate between headed blocks and bare rows.
 * A tool with no `type` link at all is a single by definition.
 */
function groupToolsByType(tools: DashboardTool[]): { groups: TypeGroup[]; singles: DashboardTool[] } {
  const byType = new Map<string, DashboardTool[]>()
  const singles: DashboardTool[] = []

  for (const tool of tools) {
    if (!tool.typeName) {
      singles.push(tool)
      continue
    }
    const bucket = byType.get(tool.typeName)
    if (bucket) bucket.push(tool)
    else byType.set(tool.typeName, [tool])
  }

  const groups: TypeGroup[] = []
  for (const [typeName, group] of byType) {
    if (group.length === 1) singles.push(group[0])
    else groups.push({ typeName, tools: group.sort(byName) })
  }

  groups.sort((a, b) => a.typeName.localeCompare(b.typeName))
  singles.sort((a, b) => (a.typeName ?? "").localeCompare(b.typeName ?? "") || byName(a, b))

  return { groups, singles }
}

/** Everything the one-line row drops, back on hover — floor and holder are
 *  gone from the layout, not from the data. */
function toolTooltip(tool: DashboardTool): string {
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

export function LocationCard({
  location,
  tools,
  isExtra,
}: {
  location: string
  tools: DashboardTool[]
  isExtra: boolean
}) {
  const isUnset = location === NO_LOCATION
  const { groups, singles } = React.useMemo(() => groupToolsByType(tools), [tools])

  return (
    <Card
      // `--card-spacing` drives the card's `py` and both slots' `px` in one
      // declaration, so there's no need to override each slot separately.
      // Overriding the variable rather than passing `size="sm"` is deliberate:
      // `Card`'s own `data-[size=sm]:` variant would outrank a plain arbitrary
      // property and win.
      //
      // `border ring-0` swaps `Card`'s faint self-ring for a real 1px `--border`
      // line. In light mode `--card` and `--background` are both pure white, so
      // the outline is the *only* thing separating one card from the next — and
      // packed this densely they need to read as distinct boxes.
      className={cn("gap-1 border ring-0 [--card-spacing:--spacing(2)]", isExtra && "ring-2 ring-primary/60")}
      title={isExtra ? `${location} — match found outside your selection` : undefined}
    >
      {/* A full-bleed band, not just styled text: `-mt-(--card-spacing)` cancels
          `Card`'s top padding so it reaches the card's top edge, where the
          card's own `overflow-hidden rounded-xl` clips its corners for it.
          `items-center` (over the slot's `items-start`) centres the count badge
          against the title now that the band is the only thing setting this
          row's height.

          `bg-primary` + `text-primary-foreground`: the app's amber, so the band
          carries no colour of its own and the pair is contrast-correct by
          construction in both themes (`--primary` is the same value in each).
          It's what separates the site name from the tool names beneath it — the
          name itself no longer needs a tint.

          `py-0.5`, not the card spacing: at this density the band only needs to
          clear the text. No `border-b` — the fill already separates it, and the
          slot's `[.border-b]:pb-(--card-spacing)` variant outranks any plain
          `pb-*`, so a border here would silently pin the padding back open. */}
      <CardHeader className="-mt-(--card-spacing) items-center bg-primary/10 py-0.5">
        {/* `truncate`, not `wrap-anywhere`: a job name like "107 Greenwich St -
            J24-0407" wrapped to three lines at this column width. Unset fades
            its own text rather than switching to `--muted-foreground`, which is
            a grey picked to sit on `--background`, not on the amber band. */}
        <CardTitle className={cn("truncate text-sm text-primary", isUnset && "italic opacity-70")} title={location}>
          {location}
        </CardTitle>
        {isExtra && <span className="sr-only">Match found outside your selection</span>}
        <CardAction>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
            {tools.length}
          </Badge>
        </CardAction>
      </CardHeader>

      {/* `overflow-y-auto` makes the used `overflow-x` compute to `auto` too, so
          a pathological name could raise a horizontal scrollbar — pin it shut.
          `overscroll-contain` stops scroll chaining to the page, which matters
          when the screen holds dozens of these scrollers. */}
      <CardContent
        className={cn(
          TOOL_LIST_MAX_HEIGHT,
          "scrollbar-slim gap-0 overflow-x-hidden overflow-y-auto overscroll-contain px-1"
        )}
      >
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
      </CardContent>
    </Card>
  )
}

/** `sticky` so the type you're looking at stays named while a long card
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
function ToolLine({ tool, showType = false }: { tool: DashboardTool; showType?: boolean }) {
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
