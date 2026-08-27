import type { Metadata } from "next"
import { Suspense } from "react"

import { ToolsDashboard } from "@/components/tools-dashboard"
import { Skeleton } from "@/components/ui/skeleton"
import { listAllTools } from "@/lib/bubble/pickup-tools"

export const metadata: Metadata = { title: "Tools" }

export default function ToolsPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium">Tools</h1>
        <p className="text-sm text-muted-foreground">Every tool, grouped by its current location.</p>
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
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-full max-w-md" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
