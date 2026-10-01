import { MaterialStockHistoryPaged } from "@/components/material-stock-history-paged"
import { loadStockHistoryPage } from "@/app/(app)/materials/[itemId]/history-actions"
import type { MaterialItem } from "@/lib/bubble/material-items-types"

/**
 * The item page's history column, fetched on its own so a slow history read
 * never holds back the header or the edit form. Needs the item only for its
 * unit, so it awaits the page's shared item promise alongside its own read.
 */
export async function MaterialHistoryPanel({
  itemId,
  item,
}: {
  itemId: string
  item: Promise<MaterialItem | null>
}) {
  const [first, resolved] = await Promise.all([loadStockHistoryPage({ itemId, cursor: 0 }), item])

  return (
    <MaterialStockHistoryPaged
      key={first.entries[0]?.id ?? "empty"}
      itemId={itemId}
      unit={resolved?.unit ?? ""}
      initial={first}
    />
  )
}
