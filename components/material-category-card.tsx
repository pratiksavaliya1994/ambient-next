import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import { cn } from "@/lib/utils"

/**
 * One category, one card, one row per item — `/materials`' unit of layout.
 * A sibling of `WarehouseTypeCard` and `SiteStockCard`: same amber band, same
 * count badge, same dense rows, so the warehouse's wall screens all read alike.
 */
export function MaterialCategoryCard({ category, items }: { category: string; items: MaterialItem[] }) {
  return (
    <Card className="gap-1 border ring-0 [--card-spacing:--spacing(2)]">
      <CardHeader className="-mt-(--card-spacing) items-center bg-primary py-0.5">
        <CardTitle className="truncate text-sm text-primary-foreground" title={category}>
          {category}
        </CardTitle>
        <CardAction>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
            {items.length}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="gap-0.5 overflow-x-hidden px-1">
        {items.map((item) => (
          <MaterialRow key={item.id} item={item} />
        ))}
      </CardContent>
    </Card>
  )
}

/** Name · shelf on the left, stock on the right — red at or below zero, the
 *  same rule as `MaterialStockBadge`. Retired items stay dimmed. */
function MaterialRow({ item }: { item: MaterialItem }) {
  const empty = item.stockQty <= 0

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs hover:bg-muted/60",
        !item.active && "opacity-60"
      )}
    >
      <Link
        href={`/materials/${item.id}`}
        className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline"
        title={item.name}
      >
        {item.name}
        {item.warehouseLocation && (
          <span className="font-normal text-muted-foreground"> · {item.warehouseLocation}</span>
        )}
      </Link>
      {!item.active && (
        <Badge variant="outline" className="h-4 px-1 text-[10px]">
          Retired
        </Badge>
      )}
      <span className={cn("shrink-0 font-semibold tabular-nums", empty && "text-destructive")}>
        {item.stockQty} {item.unit}
      </span>
    </div>
  )
}
