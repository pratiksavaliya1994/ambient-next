import { Skeleton } from "@/components/ui/skeleton"

/** Mirrors the "By location" tab's multi-column layout so the fallback
 *  doesn't reserve a block of a different shape to what replaces it. */
export function ToolsDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="columns-3xs gap-3">
        {[36, 24, 44, 28, 32, 20].map((height, index) => (
          <Skeleton key={index} className="mb-3 block w-full" style={{ height: `${height * 4}px` }} />
        ))}
      </div>
    </div>
  )
}

/** Mirrors the "All tools" tab: search + filter row, then a grid of cards. */
export function ToolsListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full max-w-md" />
      <Skeleton className="h-9 w-full max-w-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    </div>
  )
}
