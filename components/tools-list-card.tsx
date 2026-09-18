import { MapPinIcon, UserIcon, WrenchIcon } from "lucide-react"
import Link from "next/link"

import { ConditionBadge, StatusBadge } from "@/components/tool-status-badges"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardTool } from "@/lib/bubble/pickup-tools-types"

/** One tool, one card — the "All tools" tab's flat grid, as opposed to the
 *  "By location" tab's cards-per-location layout (`tools-location-card.tsx`).
 *
 *  `border ring-0` swaps `Card`'s faint self-ring for a real 1px `--border`
 *  line, same reasoning as `LocationCard` — packed into a dense grid, cards
 *  need a real edge to read as distinct boxes rather than one flat wash. */
export function ToolsListCard({ tool }: { tool: DashboardTool }) {
  return (
    <Card size="sm" className="relative gap-2 border ring-0">
      <CardHeader>
        {/* The link sits on the title for semantics, but `after:absolute
            after:inset-0` (relative to the `Card` above) stretches its hit
            area over the whole card — the standard "stretched link" pattern,
            so the badges stay visually inert while the whole card is clickable. */}
        <CardTitle className="min-w-0 truncate" title={tool.name}>
          <Link href={`/tools/${tool.id}`} className="after:absolute after:inset-0 hover:underline">
            {tool.name}
          </Link>
        </CardTitle>
        {/* Status stays pinned top-right beside the title. Condition — only
            rendered when notable — falls into the header's second grid row,
            below the title and left-aligned, rather than crowding the title's
            column or leaving that row empty when there's nothing to show. */}
        <CardAction>
          {tool.condition === "Ok" ? (
            <StatusBadge status={tool.status} />
          ) : (
            <ConditionBadge condition={tool.condition} />
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="gap-1.5 text-xs text-muted-foreground">
        {tool.typeName && (
          <p className="flex items-center gap-1.5 truncate">
            <WrenchIcon className="size-3.5 shrink-0" />
            <span className="truncate">{tool.typeName}</span>
          </p>
        )}
        <p className="flex items-center gap-1.5 truncate">
          <MapPinIcon className="size-3.5 shrink-0" />
          <span className="truncate">
            {tool.location}
            {tool.floor && ` · Floor ${tool.floor}`}
          </span>
        </p>
        {tool.currentUser && (
          <p className="flex items-center gap-1.5 truncate">
            <UserIcon className="size-3.5 shrink-0" />
            <span className="truncate">{tool.currentUser}</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
