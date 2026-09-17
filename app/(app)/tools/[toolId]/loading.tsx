import { Skeleton } from "@/components/ui/skeleton"

/** Mirrors the detail page: title + badge row, then the edit card. */
export default function ToolDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-40" />
        </div>
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
