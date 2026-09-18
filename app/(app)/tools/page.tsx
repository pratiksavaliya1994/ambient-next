import type { Metadata } from "next"
import { Suspense } from "react"

import { ToolsDashboard } from "@/components/tools-dashboard"
import { ToolsDashboardSkeleton } from "@/components/tools-skeletons"
import { listAllTools } from "@/lib/bubble/pickup-tools"

export const metadata: Metadata = { title: "Job Dashboard" }
export const revalidate = 60

/**
 * Every tool grouped by its current job/location — the original "Tools"
 * screen, renamed to what it actually is: a dashboard read by job site, not a
 * flat tool inventory. That's `/tools/all` now (`app/(app)/tools/all/page.tsx`).
 */
export default function ToolsPage() {
  return (
    <div className="flex w-full flex-col gap-3">
      {/* Title and blurb share one line — this screen is measured by how many
          locations fit above the fold, so the header pays for itself in rows. */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h1 className="text-lg font-medium">Job Dashboard</h1>
        <p className="text-xs text-muted-foreground">Every tool, grouped by its current location.</p>
      </div>

      <Suspense fallback={<ToolsDashboardSkeleton />}>
        <ToolsList />
      </Suspense>
    </div>
  )
}

async function ToolsList() {
  const tools = await listAllTools()
  return <ToolsDashboard tools={tools} />
}
