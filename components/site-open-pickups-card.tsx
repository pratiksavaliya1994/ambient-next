import Link from "next/link"

import { MaterialLineRow, quantityLabel } from "@/components/material-line-row"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ItemGroup } from "@/components/ui/item"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { isLinkedTransfer } from "@/lib/bubble/requested-materials-types"
import { listOpenSitePickups, type SitePickupLine } from "@/lib/bubble/site-pickups"

const LINK = "font-medium text-foreground underline-offset-2 hover:underline"

/**
 * The site page's read for this card, streamed in its own `<Suspense>`. A
 * secondary card: a failed read says so here rather than taking the page down.
 */
export async function SiteOpenPickupsSection({ jobName }: { jobName: string }) {
  const pickups = await listOpenSitePickups(jobName).catch(() => null)
  if (pickups) return <SiteOpenPickupsCard pickups={pickups} />
  return (
    <Alert variant="destructive">
      <AlertDescription>Couldn&rsquo;t load this site&rsquo;s open pickups. Reload to try again.</AlertDescription>
    </Alert>
  )
}

/**
 * "Open pickups from this site" (5G §5): material lines on open pickup
 * requests at this job that haven't come back yet — each with its estimate and
 * where it's going (the warehouse, or "→ Site B" for a transfer), linking to
 * its request. Renders nothing when there are none, so a site with nothing
 * waiting doesn't grow an empty card.
 */
export function SiteOpenPickupsCard({ pickups }: { pickups: readonly SitePickupLine[] }) {
  if (pickups.length === 0) return null

  return (
    <Card data-size="sm">
      <CardHeader>
        <CardTitle className="text-base">Open pickups from this site</CardTitle>
        <span className="text-sm text-muted-foreground tabular-nums">
          {pickups.length} {pickups.length === 1 ? "material" : "materials"} to collect
        </span>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-1.5">
          {pickups.map(({ line, start, onTrip, collected }) => (
            <MaterialLineRow
              key={line.id}
              line={line}
              meta={
                <>
                  <span className="tabular-nums">
                    {line.quantity !== null ? `about ${quantityLabel(line)}` : quantityLabel(line)}
                  </span>
                  {collected > 0 && <span className="tabular-nums">· {collected} collected</span>}
                  {isLinkedTransfer(line) ? (
                    <Link href={`/requests/${line.transferToRequestId}`} className={LINK}>
                      → {line.transferToLocation}
                    </Link>
                  ) : (
                    <span>to the warehouse</span>
                  )}
                  <Link href={`/requests/${line.requestId}`} className={LINK}>
                    · pickup {start ? newYorkDayLabel(start) : "request"}
                  </Link>
                  {onTrip && <Badge variant="secondary">On a trip</Badge>}
                </>
              }
            />
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}
