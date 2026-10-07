import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination"
import { cn } from "@/lib/utils"

/** First, last, and the current page with one either side — gaps become an ellipsis. */
function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages))
  const sorted = [...wanted].sort((a, b) => a - b)
  return sorted.flatMap((p, index) => (index > 0 && p - sorted[index - 1] > 1 ? ["gap" as const, p] : [p]))
}

/**
 * Server-rendered page links. `next/link` rather than the vendored
 * `PaginationLink` (a bare `<a>`), so moving between pages is a client
 * navigation instead of a full reload.
 */
export function PageLinks({
  page,
  totalPages,
  hrefFor,
}: {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
}) {
  if (totalPages <= 1) return null

  return (
    <Pagination>
      <PaginationContent className="flex-wrap justify-center">
        <PaginationItem>
          <Link
            href={hrefFor(page - 1)}
            aria-label="Go to previous page"
            aria-disabled={page <= 1}
            className={cn(buttonVariants({ variant: "ghost" }), page <= 1 && "pointer-events-none opacity-50")}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            <span className="hidden sm:block">Previous</span>
          </Link>
        </PaginationItem>

        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <PaginationItem key={`gap-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={entry}>
              <Link
                href={hrefFor(entry)}
                aria-current={entry === page ? "page" : undefined}
                className={buttonVariants({ variant: entry === page ? "outline" : "ghost", size: "icon" })}
              >
                {entry}
              </Link>
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <Link
            href={hrefFor(page + 1)}
            aria-label="Go to next page"
            aria-disabled={page >= totalPages}
            className={cn(buttonVariants({ variant: "ghost" }), page >= totalPages && "pointer-events-none opacity-50")}
          >
            <span className="hidden sm:block">Next</span>
            <ChevronRightIcon data-icon="inline-end" />
          </Link>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
