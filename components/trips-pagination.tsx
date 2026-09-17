import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

function hrefForPage(page: number, from: string, to: string) {
  const params = new URLSearchParams({ tab: "all", page: String(page) })
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  return `/trips?${params}`
}

/** Page links for the "All trips" tab — `tab=all` plus the current date range travel with every link. */
export function TripsPagination({
  page,
  pageCount,
  from,
  to,
}: {
  page: number
  pageCount: number
  from: string
  to: string
}) {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={page > 1 ? hrefForPage(page - 1, from, to) : undefined}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>

        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
          <PaginationItem key={number}>
            <PaginationLink href={hrefForPage(number, from, to)} isActive={number === page}>
              {number}
            </PaginationLink>
          </PaginationItem>
        ))}

        <PaginationItem>
          <PaginationNext
            href={page < pageCount ? hrefForPage(page + 1, from, to) : undefined}
            aria-disabled={page >= pageCount}
            className={page >= pageCount ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
