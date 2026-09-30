import type { Metadata } from "next"
import { Suspense } from "react"

import { AutoRefresh } from "@/components/auto-refresh"
import { MaterialsBySite } from "@/components/materials-by-site"
import { MaterialsBySiteSkeleton } from "@/components/materials-site-skeletons"
import { MaterialsViewSwitch } from "@/components/materials-view-switch"
import { listSiteStock, siteJobIds } from "@/lib/bubble/site-stock"
import { groupBySite } from "@/lib/bubble/site-stock-types"

export const metadata: Metadata = { title: "Materials by site" }

/**
 * What each job site has been sent and not sent back, one card per site —
 * the Job Dashboard's layout, for materials.
 *
 * **"Delivered, not picked up" is the figure, never "on site".** Nobody records
 * what gets used on a job, so this is an upper bound, and the blurb says so.
 * One read of every site row, grouped (duplicates summed) on the server;
 * search filters in the browser.
 */
export default function MaterialsBySitePage() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h1 className="text-lg font-medium">Materials</h1>
        <p className="text-xs text-muted-foreground">
          Delivered, not picked up — what each job site has been sent and not sent back. Use on site isn&rsquo;t
          tracked, so this is the most that can be there.
        </p>
      </div>

      <MaterialsViewSwitch active="sites" />

      <AutoRefresh />

      <Suspense fallback={<MaterialsBySiteSkeleton />}>
        <SitesList />
      </Suspense>
    </div>
  )
}

async function SitesList() {
  const groups = groupBySite(await listSiteStock())
  const jobIds = await siteJobIds(groups.map((group) => group.location))
  return <MaterialsBySite groups={groups} jobIds={Object.fromEntries(jobIds)} />
}
