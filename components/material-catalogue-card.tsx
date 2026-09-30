import { MapPinIcon, TagIcon } from "lucide-react"
import Link from "next/link"

import { MaterialStockBadge } from "@/components/material-stock-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import { cn } from "@/lib/utils"

/**
 * One catalogue item: name, category, what it's offered for, and its stock
 * pinned top-right. The whole card is the link — the "stretched link" pattern
 * `ToolsListCard` uses, so the badges stay inert while everything is clickable.
 */
export function MaterialCatalogueCard({ item }: { item: MaterialItem }) {
  return (
    <Card size="sm" className={cn("relative gap-2 border ring-0", !item.active && "opacity-70")}>
      <CardHeader>
        <CardTitle className="min-w-0 truncate" title={item.name}>
          <Link href={`/materials/${item.id}`} className="after:absolute after:inset-0 hover:underline">
            {item.name}
          </Link>
        </CardTitle>
        <CardAction>
          <MaterialStockBadge stockQty={item.stockQty} unit={item.unit} />
        </CardAction>
      </CardHeader>
      <CardContent className="gap-1.5 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.category && (
            <span className="flex items-center gap-1.5">
              <TagIcon className="size-3.5 shrink-0" />
              {item.category}
            </span>
          )}
          {item.warehouseLocation && (
            <span className="flex items-center gap-1.5">
              <MapPinIcon className="size-3.5 shrink-0" />
              {item.warehouseLocation}
            </span>
          )}
          {!item.active && <Badge variant="outline">Retired</Badge>}
        </div>
        <p className="line-clamp-2">
          {item.relatedTo.length === 0 ? "Offered for every job type" : item.relatedTo.join(" · ")}
        </p>
      </CardContent>
    </Card>
  )
}
