import type { Metadata } from "next"
import { Suspense } from "react"

import { ToolsDashboard } from "@/components/tools-dashboard"
import { Skeleton } from "@/components/ui/skeleton"
import { listAllTools } from "@/lib/bubble/pickup-tools"

export const metadata: Metadata = { title: "Tools" }

export default function ToolsPage() {
  return (
    <div className="flex w-full flex-col gap-3">
      {/* Title and blurb share one line — this screen is measured by how many
          locations fit above the fold, so the header pays for itself in rows. */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h1 className="text-lg font-medium">Tools</h1>
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

function ToolsDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full max-w-md" />
      {/* Mirrors the real layout's columns so the fallback doesn't reserve a
          block of a different shape to what replaces it. */}
      <div className="columns-3xs gap-3">
        {[36, 24, 44, 28, 32, 20].map((height, index) => (
          <Skeleton key={index} className="mb-3 block w-full" style={{ height: `${height * 4}px` }} />
        ))}
      </div>
    </div>
  )
}
