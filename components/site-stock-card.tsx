import Link from "next/link"

import { SiteStockItemList } from "@/components/site-stock-items"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { newYorkLabel } from "@/lib/bubble/dates"
import type { SiteGroup } from "@/lib/bubble/site-stock-types"

/**
 * One job site on the By-site view: the Job Dashboard's `LocationCard` — an
 * amber band naming the site, a count, a dense list under it — with material
 * lines instead of tools.
 *
 * The band links to the site page when the location matches a job; one that
 * doesn't (a typo `check-bubble` would flag) still shows, unlinked.
 */
export function SiteStockCard({ group, jobId }: { group: SiteGroup; jobId?: string }) {
  return (
    <Card className="gap-1 border ring-0 [--card-spacing:--spacing(2)]">
      <CardHeader className="-mt-(--card-spacing) items-center bg-primary py-0.5">
        <CardTitle className="truncate text-sm text-primary-foreground" title={group.location}>
          {jobId ? (
            <Link href={`/materials/sites/${jobId}`} className="hover:underline">
              {group.location}
            </Link>
          ) : (
            group.location
          )}
        </CardTitle>
        <CardAction>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
            {group.items.length}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="scrollbar-slim max-h-80 gap-0 overflow-x-hidden overflow-y-auto px-1">
        <SiteStockItemList items={group.items} />
      </CardContent>

      {group.modifiedAt && (
        <CardFooter className="text-[10px] text-muted-foreground">Last moved {newYorkLabel(group.modifiedAt)}</CardFooter>
      )}
    </Card>
  )
}
