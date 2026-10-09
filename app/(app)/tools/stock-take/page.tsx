import type { Metadata } from "next"
import { Suspense } from "react"

import { StockTakeCount } from "@/components/stock-take-count"
import { ToolsListSkeleton } from "@/components/tools-skeletons"
import { WAREHOUSE_JOB_NAMES } from "@/lib/bubble/enums"
import { listJobs } from "@/lib/bubble/reference"
import { findStockTakeHolds, listStockTakeTools } from "@/lib/bubble/stock-take"
import { lockReasonOf, type StockTakeLocks } from "@/lib/tools/stock-take"

export const metadata: Metadata = { title: "Stock take" }

/**
 * Fixing where tools are: pick a place, tick the tools physically there, save.
 * Always available — it writes only what a trip drop would, and a tool a live
 * trip or request holds, or marked `Assigned`/`In Transit`, can't be ticked.
 * Rules live in `lib/tools/stock-take.ts`.
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

  // Shown up front so a locked tool can't be ticked. The save re-checks — a
  // tool can be claimed while this page sits open.
  const holds = await findStockTakeHolds(tools.map((tool) => tool.id))
  const locks: StockTakeLocks = Object.fromEntries(
    tools.flatMap((tool) => {
      const reason = lockReasonOf(tool, holds)
      return reason ? [[tool.id, reason]] : []
    })
  )

  const locations = [...new Set([...WAREHOUSE_JOB_NAMES, ...jobs.map((job) => job.name)])].sort((a, b) =>
    a.localeCompare(b)
  )

  return <StockTakeCount tools={tools} locks={locks} locations={locations} />
}
