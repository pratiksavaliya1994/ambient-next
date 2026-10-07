import type { Metadata } from "next"
import { Suspense } from "react"

import { AutoRefresh } from "@/components/auto-refresh"
import { WarehouseDashboard } from "@/components/warehouse-dashboard"
import { ToolsDashboardSkeleton } from "@/components/tools-skeletons"
import { listAllTools } from "@/lib/bubble/pickup-tools"
import { warehouseTools } from "@/lib/tools/warehouse-filters"

export const metadata: Metadata = { title: "Warehouse" }
export const revalidate = 60

/**
 * Every tool actually at the warehouse right now, grouped by tool type — `/tools`
 * answers "what's on this job site," `/tools/all` "show me everything,"
 * this answers "what do we have on hand to send out." A fraction of the full
 * inventory (see `warehouse-filters.ts`). No floor anywhere on it: a warehouse
 * row's `floor` is stale residue from the job site it came back from.
 */
export default function WarehousePage() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h1 className="text-lg font-medium">Warehouse</h1>
        <p className="text-xs text-muted-foreground">Every tool on hand at the warehouse, grouped by type.</p>
      </div>

      <AutoRefresh />

      <Suspense fallback={<ToolsDashboardSkeleton />}>
        <WarehouseBody />
      </Suspense>
    </div>
  )
}

/** Only warehouse rows cross to the client — filtering on them happens there. */
async function WarehouseBody() {
  const tools = await listAllTools()
  return <WarehouseDashboard tools={warehouseTools(tools)} />
}
