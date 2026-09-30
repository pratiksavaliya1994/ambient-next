import { SiteStockItemList } from "@/components/site-stock-items"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { SiteItem } from "@/lib/bubble/site-stock-types"

/** The job site page's materials card — `SiteToolsCard`'s counterpart for
 *  what has been delivered to this site and not sent back. */
export function SiteMaterialsCard({ items }: { items: readonly SiteItem[] }) {
  return (
    <Card data-size="sm">
      <CardHeader>
        <CardTitle className="text-base">Materials on site</CardTitle>
        <span className="text-sm text-muted-foreground tabular-nums">
          {items.length} {items.length === 1 ? "material" : "materials"}
        </span>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyTitle>Nothing here now</EmptyTitle>
              <EmptyDescription>No materials are currently at this site.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <SiteStockItemList items={items} />
        )}
      </CardContent>
    </Card>
  )
}
