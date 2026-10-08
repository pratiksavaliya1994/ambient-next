import type { Metadata } from "next"
import { Suspense } from "react"

import { StockTakeCount } from "@/components/stock-take-count"
import { ToolsListSkeleton } from "@/components/tools-skeletons"
import { WAREHOUSE_JOB_NAMES } from "@/lib/bubble/enums"
import { listJobs } from "@/lib/bubble/reference"
import { listStockTakeTools } from "@/lib/bubble/stock-take"

export const metadata: Metadata = { title: "Stock take" }

/**
 * Fixing where tools are: pick a place, tick the tools physically there, save.
 * Always available — it writes only what a trip drop would and skips anything
 * a live trip or request holds. Rules live in `lib/tools/stock-take.ts`.
 */
export default function StockTakePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h1 className="text-lg font-medium">Stock take</h1>
        <p className="text-xs text-muted-foreground">
          Pick where you are, tick the tools physically there, save. Tools on a job site are recorded Delivered,
          at the warehouse Available.
        </p>
      </div>

      <Suspense fallback={<ToolsListSkeleton />}>
        <StockTakeBody />
      </Suspense>
    </div>
  )
}

async function StockTakeBody() {
  const [tools, jobs] = await Promise.all([listStockTakeTools(), listJobs()])

  const locations = [...new Set([...WAREHOUSE_JOB_NAMES, ...jobs.map((job) => job.name)])].sort((a, b) =>
    a.localeCompare(b)
  )

  return <StockTakeCount tools={tools} locations={locations} />
}
