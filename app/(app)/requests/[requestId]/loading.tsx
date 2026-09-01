import { Skeleton } from "@/components/ui/skeleton"

export default function RequestDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>

      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
