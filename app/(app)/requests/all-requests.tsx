import Link from "next/link"

import { NewRequestDialog } from "@/components/new-request-dialog"
import { PageLinks } from "@/components/page-links"
import { RequestCard } from "@/components/request-card"
import { RequestGrid } from "@/components/request-grid"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { pageRequests } from "@/lib/bubble/request-lists"

import { loadPoolState } from "./request-pool"

export const ALL_PAGE_SIZE = 24

export type AllRequestsQuery = { q: string; from: string; to: string; page: number }

/** `/requests?tab=all` with this search, at `page` — page 1 is left out of the URL. */
export function allRequestsHref({ q, from, to }: Omit<AllRequestsQuery, "page">, page: number) {
  const params = new URLSearchParams({ tab: "all" })
  if (q.trim()) params.set("q", q.trim())
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  if (page > 1) params.set("page", String(page))
  return `/requests?${params}`
}

/**
 * The All tab's results: one page of the whole table, newest first, searched
 * and paged on the server. The search bar sits above this on the page, outside
 * its Suspense boundary, so it stays put while a page streams in.
 */
export async function AllRequests({ q, from, to, page }: AllRequestsQuery) {
  const [{ requests, total }, poolStateOf] = await Promise.all([
    pageRequests({ query: q, from: from || undefined, to: to || undefined, page, pageSize: ALL_PAGE_SIZE }),
    loadPoolState(),
  ])
  const totalPages = Math.ceil(total / ALL_PAGE_SIZE)
  const isSearching = Boolean(q.trim() || from || to)

  if (requests.length === 0) {
    return <NoRequests q={q} from={from} to={to} page={page} total={total} isSearching={isSearching} />
  }

  const first = (page - 1) * ALL_PAGE_SIZE + 1
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        Showing {first}–{first + requests.length - 1} of {total.toLocaleString("en-US")}{" "}
        {total === 1 ? "request" : "requests"}
      </p>
      <RequestGrid>
        {requests.map((request) => (
          <RequestCard key={request.id} request={request} pool={poolStateOf(request.id)} />
        ))}
      </RequestGrid>
      <PageLinks page={page} totalPages={totalPages} hrefFor={(p) => allRequestsHref({ q, from, to }, p)} />
    </div>
  )
}

function NoRequests({ q, from, to, page, total, isSearching }: AllRequestsQuery & { total: number; isSearching: boolean }) {
  // Past the last page of a non-empty result — a stale or hand-edited link.
  if (total > 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing on page {page}</EmptyTitle>
          <EmptyDescription>There are only {Math.ceil(total / ALL_PAGE_SIZE)} pages.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href={allRequestsHref({ q, from, to }, 1)} className={buttonVariants({ variant: "outline" })}>
            Go to the first page
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{isSearching ? "No matching requests" : "Nothing to show"}</EmptyTitle>
        <EmptyDescription>
          {!isSearching
            ? "No requests have been created yet."
            : q.trim()
              ? `Nothing matches "${q.trim()}"${from || to ? " scheduled in that date range" : ""}.`
              : "Nothing is scheduled in that date range."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {isSearching ? (
          <Link href="/requests?tab=all" className={buttonVariants({ variant: "outline" })}>
            Clear search
          </Link>
        ) : (
          <NewRequestDialog />
        )}
      </EmptyContent>
    </Empty>
  )
}
