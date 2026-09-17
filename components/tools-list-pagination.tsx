import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { toolsListHref, type ToolsListParams } from "@/lib/tools/list-filters"

/**
 * Which page numbers to show around the current one, collapsing the rest
 * behind an ellipsis — unlike `trips-pagination.tsx` (built for a handful of
 * pages), a tool inventory can run to a couple hundred pages and rendering
 * every number would overflow any screen, mobile especially.
 */
function pageWindow(page: number, pageCount: number): (number | "ellipsis")[] {
  const kept = new Set([1, pageCount, page - 1, page, page + 1])
  const sorted = [...kept].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b)

  const result: (number | "ellipsis")[] = []
  let previous = 0
  for (const n of sorted) {
    if (previous && n - previous > 1) result.push("ellipsis")
    result.push(n)
    previous = n
  }
  return result
}

/** Page links for the "All tools" tab — every current filter travels with
 *  each link via `toolsListHref`. Numbered links show from `sm` up; on a
 *  phone, Previous/Next plus a "Page X of Y" label is what reliably fits. */
export function ToolsListPagination({ current }: { current: ToolsListParams & { pageCount: number } }) {
  const { page, pageCount } = current

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={page > 1 ? toolsListHref({ page: page - 1 }, current) : undefined}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>

        {pageWindow(page, pageCount).map((entry, index) =>
          entry === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`} className="hidden sm:list-item">
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={entry} className="hidden sm:list-item">
              <PaginationLink href={toolsListHref({ page: entry }, current)} isActive={entry === page}>
                {entry}
              </PaginationLink>
            </PaginationItem>
          )
        )}

        <PaginationItem className="px-2 text-sm text-muted-foreground sm:hidden">
          Page {page} of {pageCount}
        </PaginationItem>

        <PaginationItem>
          <PaginationNext
            href={page < pageCount ? toolsListHref({ page: page + 1 }, current) : undefined}
            aria-disabled={page >= pageCount}
            className={page >= pageCount ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
