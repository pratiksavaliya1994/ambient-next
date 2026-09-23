import type { Metadata } from "next"
import { Suspense } from "react"

import { WarehouseDashboard } from "@/components/warehouse-dashboard"
import { ToolsDashboardSkeleton } from "@/components/tools-skeletons"
import { listAllTools } from "@/lib/bubble/pickup-tools"
import {
  filterWarehouseTools,
  groupByToolType,
  parseWarehouseParams,
  type WarehouseRawParams,
} from "@/lib/tools/warehouse-filters"

export const metadata: Metadata = { title: "Warehouse" }
export const revalidate = 60

/**
 * Every tool actually at the warehouse right now, grouped by tool type — `/tools`
 * answers "what's on this job site," `/tools/all` "show me everything,"
 * this answers "what do we have on hand to send out." A fraction of the full
 * inventory (see `warehouse-filters.ts`), so each row can afford floor and
 * holder inline instead of the by-location dashboard's dots-only line.
 */
export default async function WarehousePage({ searchParams }: { searchParams: Promise<WarehouseRawParams> }) {
  const params = await searchParams

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h1 className="text-lg font-medium">Warehouse</h1>
        <p className="text-xs text-muted-foreground">Every tool on hand at the warehouse, grouped by type.</p>
      </div>

      <Suspense key={JSON.stringify(params)} fallback={<ToolsDashboardSkeleton />}>
        <WarehouseBody params={params} />
      </Suspense>
    </div>
  )
}

async function WarehouseBody({ params }: { params: WarehouseRawParams }) {
  const current = parseWarehouseParams(params)
  const tools = await listAllTools()
  const filtered = filterWarehouseTools(tools, current)
  const groups = groupByToolType(filtered)

  return <WarehouseDashboard current={current} groups={groups} totalTools={filtered.length} />
}
