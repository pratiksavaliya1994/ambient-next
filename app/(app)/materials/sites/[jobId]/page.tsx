import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { MaterialStockHistory } from "@/components/material-stock-history"
import { SiteStockItemList } from "@/components/site-stock-items"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { listJobs } from "@/lib/bubble/reference"
import { listSiteHistory, listSiteStock } from "@/lib/bubble/site-stock"
import { groupBySite } from "@/lib/bubble/site-stock-types"

export const metadata: Metadata = { title: "Site materials" }

/**
 * One job site's materials: what it has been sent and not sent back, and every
 * movement that got it there.
 *
 * The URL carries the job's `_id`, looked up in the memoised jobs list, so a
 * job name never has to survive being a path segment. Site rows are keyed by
 * that name (`request.job`), which is what both reads constrain on.
 */
export default async function MaterialSitePage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params

  const job = (await listJobs()).find((entry) => entry.id === jobId)
  if (!job) notFound()

  const [rows, history] = await Promise.all([listSiteStock({ location: job.name }), listSiteHistory(job.name)])
  const items = groupBySite(rows)[0]?.items ?? []
  // Every row's unit, zeros included, so a history row for an item since
  // picked up in full still reads "−20 bag" rather than a bare number.
  const units = new Map(rows.map((row) => [row.materialId, row.unit]))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-medium wrap-anywhere">{job.name}</h1>
          <Link
            href="/materials/sites"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
          >
            <ArrowLeftIcon />
            All sites
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Delivered, not picked up. Use on site isn&rsquo;t tracked, so this is the most that can be there.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card data-size="sm">
          <CardHeader>
            <CardTitle className="text-base">Delivered, not picked up</CardTitle>
            <span className="text-sm text-muted-foreground tabular-nums">
              {items.length} {items.length === 1 ? "material" : "materials"}
            </span>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <Empty className="border border-dashed py-8">
                <EmptyHeader>
                  <EmptyTitle>Nothing here now</EmptyTitle>
                  <EmptyDescription>Nothing delivered to this site is waiting to be picked up.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <SiteStockItemList items={items} />
            )}
          </CardContent>
        </Card>

        <Card data-size="sm" className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
            <span className="text-sm text-muted-foreground">Every stock change at this site, newest first.</span>
          </CardHeader>
          <CardContent className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
            <MaterialStockHistory
              entries={history}
              unit=""
              itemUnits={units}
              showItem
              emptyDescription="Deliveries to this site will show up here."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
