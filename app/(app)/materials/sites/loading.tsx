import { MaterialsBySiteSkeleton } from "@/components/materials-site-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function MaterialsBySiteLoading() {
  return (
    <div className="flex w-full flex-col gap-3">
      <Skeleton className="h-6 w-96 max-w-full" />
      <Skeleton className="h-8 w-48" />
      <MaterialsBySiteSkeleton />
    </div>
  )
}
