import type { Metadata } from "next"
import { Suspense } from "react"

import { NewRequestDialog, NewRequestFab } from "@/components/new-request-dialog"
import { RequestListSkeleton } from "@/components/request-grid"
import { RequestSearchBar } from "@/components/request-search"
import { RequestTabs, type RequestTab } from "@/components/request-tabs"

import { ActiveRequests } from "./active-requests"
import { AllRequests } from "./all-requests"

export const metadata: Metadata = { title: "Tool requests" }

/**
 * Two tabs over the same cards. **Active** is every request whose lifecycle
 * isn't over, fetched whole and filtered in the browser. **All** is the whole
 * table, searched and paged on the server. Only the tab in the URL is fetched.
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; from?: string; to?: string; page?: string }>
}) {
  const { tab: tabParam, q = "", from = "", to = "", page: pageParam } = await searchParams
  const tab: RequestTab = tabParam === "all" ? "all" : "active"
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1)
  const searchKey = `${q}|${from}|${to}`

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-medium">Tool requests</h1>
        <NewRequestDialog />
      </div>

      <RequestTabs key={`tabs-${tab}`} tab={tab} />

      {tab === "active" ? (
        // Bubble needs several round trips for these and is not fast; stream.
        <Suspense key="results-active" fallback={<RequestListSkeleton />}>
          <ActiveRequests />
        </Suspense>
      ) : (
        <>
          <RequestSearchBar key={`search-${searchKey}`} query={q} from={from} to={to} />
          {/* Keyed by the search and page so moving between them resets this
              boundary to its fallback rather than leaving the previous results
              on screen. Prefixed so it can't collide with the search bar's key
              — React wants sibling keys unique regardless of element type. */}
          <Suspense key={`results-${searchKey}|${page}`} fallback={<RequestListSkeleton />}>
            <AllRequests q={q} from={from} to={to} page={page} />
          </Suspense>
        </>
      )}

      <NewRequestFab />
    </div>
  )
}
