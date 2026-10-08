import type { Metadata } from "next"
import { Suspense } from "react"

import { AutoRefresh } from "@/components/auto-refresh"
import { InTransitDashboard } from "@/components/in-transit-dashboard"
import { ToolsDashboardSkeleton } from "@/components/tools-skeletons"
import { listInTransit } from "@/lib/bubble/in-transit"

export const metadata: Metadata = { title: "In Transit" }
export const revalidate = 60

/**
 * Every tool and material on a truck right now, one card per driver — the
 * Job Dashboard answers "what's on this site," the Warehouse "what's on hand,"
 * this "what's moving, and with whom." A wall-screen dashboard like those two.
 * The static segment outranks `/trips/[tripId]`, so this never reads as a trip id.
 */
export default function InTransitPage() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h1 className="text-lg font-medium">In Transit</h1>
        <p className="text-xs text-muted-foreground">Every tool and material on a truck, grouped by driver.</p>
      </div>

      <AutoRefresh />

      <Suspense fallback={<ToolsDashboardSkeleton />}>
        <InTransitBody />
      </Suspense>
    </div>
  )
}

async function InTransitBody() {
  return <InTransitDashboard load={await listInTransit()} />
}
