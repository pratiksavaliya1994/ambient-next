import Link from "next/link"

import { newYorkDayLabel, newYorkLabel } from "@/lib/bubble/dates"
import type { SiteItem } from "@/lib/bubble/site-stock-types"

/**
 * A site's items, one line each: name (to the item page) · **qty + unit** ·
 * the day it last moved. Shared by the By-site cards and the site page.
 *
 * The qty is "delivered, not picked up" — the caller's heading says so, this
 * list only counts.
 */
export function SiteStockItemList({ items }: { items: readonly SiteItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.materialId}
          className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs hover:bg-muted/60"
          title={item.modifiedAt ? `Last moved ${newYorkLabel(item.modifiedAt)}` : undefined}
        >
          <Link
            href={`/materials/${item.materialId}`}
            className="min-w-0 flex-1 truncate hover:text-primary hover:underline"
          >
            {item.materialName || "Unnamed material"}
          </Link>
          <span className="shrink-0 font-semibold tabular-nums">
            {item.qty} {item.unit}
          </span>
          {item.modifiedAt && (
            <span className="w-14 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
              {newYorkDayLabel(item.modifiedAt)}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
