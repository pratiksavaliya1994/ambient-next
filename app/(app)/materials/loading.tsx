import { MaterialsCatalogueSkeleton } from "@/components/materials-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function MaterialsLoading() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <MaterialsCatalogueSkeleton />
    </div>
  )
}
