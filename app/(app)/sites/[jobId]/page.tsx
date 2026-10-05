import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { JobDetailsCard } from "@/components/job-details-card"
import { SiteMaterialsCard } from "@/components/site-materials-card"
import { SiteOpenPickupsSection } from "@/components/site-open-pickups-card"
import { SiteToolsCard } from "@/components/site-tools-card"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { listToolsForJob } from "@/lib/bubble/pickup-tools"
import { listJobs } from "@/lib/bubble/reference"
import { listSiteStock } from "@/lib/bubble/site-stock"
import { groupBySite } from "@/lib/bubble/site-stock-types"

export const metadata: Metadata = { title: "Job site" }

const CARD_SKELETON = <Skeleton className="h-48 w-full rounded-xl" />

/**
 * One job site: its `jobs` record on the left (read-only — this app doesn't
 * own `jobs` rows, only what moves through them), the tools there now and the
 * materials it has been sent and not sent back on the right, with the
 * material pickups still waiting to leave it below them (5G). No movement
 * history — it read as noise beside the two lists; an item's own page still
 * has its history.
 *
 * The job lookup is the only thing this page awaits directly — it's a single
 * find against the memoised jobs list, needed for the title, the `notFound`
 * check, and the job *name* the other two reads constrain on (`tools.location`
 * and `request.job` both hold it, never the `_id` the URL carries). Tools and
 * materials are each a **live, unmemoised** Bubble read, so they're handed to
 * their own `Suspense` boundary rather than a shared `Promise.all` — one
 * running long no longer holds the other, or the job card above them, off
 * screen.
 */
export default async function JobSitePage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params

  const job = (await listJobs()).find((entry) => entry.id === jobId)
  if (!job) notFound()

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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <JobDetailsCard job={job} />

        <div className="flex flex-col gap-6">
          <Suspense fallback={CARD_SKELETON}>
            <ToolsSection jobName={job.name} />
          </Suspense>

          <Suspense fallback={CARD_SKELETON}>
            <MaterialsSection jobName={job.name} />
          </Suspense>

          <Suspense fallback={CARD_SKELETON}>
            <SiteOpenPickupsSection jobName={job.name} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

async function ToolsSection({ jobName }: { jobName: string }) {
  const tools = await listToolsForJob(jobName)
  return <SiteToolsCard tools={tools} />
}

async function MaterialsSection({ jobName }: { jobName: string }) {
  const rows = await listSiteStock({ location: jobName })
  const items = groupBySite(rows)[0]?.items ?? []
  return <SiteMaterialsCard items={items} />
}
