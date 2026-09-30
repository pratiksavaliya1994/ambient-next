import * as React from "react"

import { groupToolsByType, ToolTypeList } from "@/components/tool-type-list"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NO_LOCATION, type DashboardTool } from "@/lib/bubble/pickup-tools-types"
import { cn } from "@/lib/utils"

/** Cap on each card's tool list before it scrolls internally. A location can
 *  hold hundreds of tools, and because the multi-column layout balances column
 *  heights, one uncapped card would set the height of *every* column. */
const TOOL_LIST_MAX_HEIGHT = "max-h-80"

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
      // the outline is the *only* thing separating one card from the next â€” and
      // packed this densely they need to read as distinct boxes.
      className={cn("gap-1 border ring-0 [--card-spacing:--spacing(2)]", isExtra && "ring-2 ring-primary/60")}
      title={isExtra ? `${location} â€” match found outside your selection` : undefined}
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
          It's what separates the site name from the tool names beneath it â€” the
          name itself no longer needs a tint.

          `py-0.5`, not the card spacing: at this density the band only needs to
          clear the text. No `border-b` â€” the fill already separates it, and the
          slot's `[.border-b]:pb-(--card-spacing)` variant outranks any plain
          `pb-*`, so a border here would silently pin the padding back open. */}
      <CardHeader className="-mt-(--card-spacing) items-center bg-primary py-0.5">
        {/* `truncate`, not `wrap-anywhere`: a job name like "107 Greenwich St -
            J24-0407" wrapped to three lines at this column width. Unset fades
            its own text rather than switching to `--muted-foreground`, which is
            a grey picked to sit on `--background`, not on the amber band. */}
        <CardTitle
          className={cn("truncate text-sm text-primary-foreground", isUnset && "italic opacity-70")}
          title={location}
        >
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
          a pathological name could raise a horizontal scrollbar â€” pin it shut.
          No `overscroll-contain` here: most cards hold too few tools to ever
          overflow `max-h-80`, and on a non-scrollable `overflow-y-auto` box
          some mobile browsers let `overscroll-behavior: contain` swallow the
          touch gesture instead of handing it to the page â€” a swipe starting
          on the card then scrolls nothing at all. Leaving it at the default
          `auto` lets the gesture chain up to the page once this box has
          nowhere left to scroll. */}
      <CardContent
        className={cn(TOOL_LIST_MAX_HEIGHT, "scrollbar-slim gap-0 overflow-x-hidden overflow-y-auto px-1")}
      >
        <ToolTypeList groups={groups} singles={singles} />
      </CardContent>
    </Card>
  )
}
