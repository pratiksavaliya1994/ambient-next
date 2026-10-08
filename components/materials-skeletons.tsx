import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const CATEGORY_CARD_HEIGHTS = ["h-40", "h-24", "h-56", "h-32", "h-20", "h-48", "h-28", "h-36"]

/** Mirrors `/materials`: the filter row, then masonry columns of category cards. */
export function MaterialsCatalogueSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-4 w-40" />
      <div className="columns-3xs gap-1">
        {CATEGORY_CARD_HEIGHTS.map((height, index) => (
          <Skeleton key={index} className={cn("mb-1 w-full break-inside-avoid", height)} />
        ))}
      </div>
    </div>
  )
}

/** Mirrors `/materials/[itemId]`: title and badges, then the two columns. */
export function MaterialDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-28" />
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  )
}

/** The item page's history column while its first page loads. */
export function MaterialHistorySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  )
}
