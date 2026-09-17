import type { Metadata } from "next"
import { Suspense } from "react"

import { ToolsListGrid } from "@/components/tools-list-grid"
import { ToolsListPagination } from "@/components/tools-list-pagination"
import { ToolsListSearch } from "@/components/tools-list-search"
import { ToolsListSelectFilters } from "@/components/tools-list-select-filters"
import { ToolsListSkeleton } from "@/components/tools-skeletons"
import { listAllTools } from "@/lib/bubble/pickup-tools"
import {
  distinctLocations,
  distinctTypeNames,
  filterTools,
  parseToolsListParams,
  TOOLS_LIST_PAGE_SIZE,
  type ToolsListRawParams,
} from "@/lib/tools/list-filters"

export const metadata: Metadata = { title: "All Tools" }

/**
 * A flat, filterable, paginated grid over every tool — as opposed to
 * `/tools`'s dashboard, which groups the same rows by job/location instead.
 */
export default async function AllToolsPage({ searchParams }: { searchParams: Promise<ToolsListRawParams> }) {
  const params = await searchParams

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h1 className="text-lg font-medium">All Tools</h1>
        <p className="text-xs text-muted-foreground">Every tool — search, filter and page through them.</p>
      </div>

      <Suspense key={JSON.stringify(params)} fallback={<ToolsListSkeleton />}>
        <AllToolsBody params={params} />
      </Suspense>
    </div>
  )
}

async function AllToolsBody({ params }: { params: ToolsListRawParams }) {
  const tools = await listAllTools()
  const current = parseToolsListParams(params)

  const filtered = filterTools(tools, current)
  filtered.sort((a, b) => a.name.localeCompare(b.name))

  const pageCount = Math.max(1, Math.ceil(filtered.length / TOOLS_LIST_PAGE_SIZE))
  const page = Math.min(current.page, pageCount)
  const paged = filtered.slice((page - 1) * TOOLS_LIST_PAGE_SIZE, page * TOOLS_LIST_PAGE_SIZE)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <ToolsListSearch current={current} />
        <ToolsListSelectFilters
          current={current}
          typeOptions={distinctTypeNames(tools)}
          locationOptions={distinctLocations(tools)}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "tool" : "tools"}
      </p>

      <ToolsListGrid tools={paged} />

      {pageCount > 1 && <ToolsListPagination current={{ ...current, page, pageCount }} />}
    </div>
  )
}
