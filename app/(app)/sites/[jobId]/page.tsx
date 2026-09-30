import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { SiteStockItemList } from "@/components/site-stock-items"
import { SiteToolsCard } from "@/components/site-tools-card"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { listToolsForJob } from "@/lib/bubble/pickup-tools"
import { listJobs } from "@/lib/bubble/reference"
import { listSiteStock } from "@/lib/bubble/site-stock"
import { groupBySite } from "@/lib/bubble/site-stock-types"

export const metadata: Metadata = { title: "Job site" }

/**
 * One job site: the tools there now, and the materials it has been sent and
 * not sent back. No movement history — it read as noise beside the two lists;
 * an item's own page still has its history.
 *
 * The URL carries the job's `_id`, looked up in the memoised jobs list, so a
 * job name never has to survive being a path segment. Everything else is keyed
 * by that name — `tools.location` and `request.job` both hold it — which is
 * what both reads constrain on.
 */
export default async function JobSitePage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params

  const job = (await listJobs()).find((entry) => entry.id === jobId)
  if (!job) notFound()

  const [tools, rows] = await Promise.all([listToolsForJob(job.name), listSiteStock({ location: job.name })])
  const items = groupBySite(rows)[0]?.items ?? []

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
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

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <SiteToolsCard tools={tools} />

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
      </div>
    </div>
  )
}
