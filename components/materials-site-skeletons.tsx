import { Skeleton } from "@/components/ui/skeleton"

/** Mirrors `/materials/sites`: the search row, then a masonry of site cards. */
export function MaterialsBySiteSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full max-w-sm" />
      <Skeleton className="h-4 w-16" />
      <div className="columns-3xs gap-1.5">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className={index % 2 === 0 ? "mb-1.5 h-40 w-full" : "mb-1.5 h-28 w-full"} />
        ))}
      </div>
    </div>
  )
}

/** Mirrors `/sites/[jobId]`: title, then tools and materials side by side. */
export function JobSiteSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Skeleton className="h-7 w-72" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}
