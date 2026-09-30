import Link from "next/link"

import { ToolStateBadges } from "@/components/tool-status-badges"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardTool } from "@/lib/bubble/pickup-tools-types"
import { NO_TOOL_TYPE } from "@/lib/tools/warehouse-filters"
import { cn } from "@/lib/utils"

/**
 * One tool type, one card, one row per unit — the Warehouse dashboard's unit
 * of layout. Visually a sibling of `LocationCard` (same header band, same
 * density).
 */
export function WarehouseTypeCard({ typeName, tools }: { typeName: string; tools: DashboardTool[] }) {
  const isUnresolved = typeName === NO_TOOL_TYPE
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Card className="gap-1 border ring-0 [--card-spacing:--spacing(2)]">
      <CardHeader className="-mt-(--card-spacing) items-center bg-primary py-0.5">
        <CardTitle
          className={cn("truncate text-sm text-primary-foreground", isUnresolved && "italic opacity-70")}
          title={typeName}
        >
          {typeName}
        </CardTitle>
        <CardAction>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
            {tools.length}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="gap-0.5 overflow-x-hidden px-1">
        {sorted.map((tool) => (
          <WarehouseToolRow key={tool.id} tool={tool} />
        ))}
      </CardContent>
    </Card>
  )
}

/** One tool, one row: name on the left, full status/condition badges on the
 *  right. `min-w-0` on the text column is the trick that lets it truncate
 *  instead of pushing the badges off — same as `ToolLine`. */
function WarehouseToolRow({ tool }: { tool: DashboardTool }) {
  return (
    <div className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-muted/60">
      <Link
        href={`/tools/${tool.id}`}
        className="min-w-0 flex-1 truncate text-xs font-medium hover:text-primary hover:underline"
      >
        {tool.name}
        {tool.warehouseLocation && (
          <span className="font-normal text-muted-foreground"> · {tool.warehouseLocation}</span>
        )}
      </Link>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        <ToolStateBadges status={tool.status} condition={tool.condition} />
      </div>
    </div>
  )
}
