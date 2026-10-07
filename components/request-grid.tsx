import { Skeleton } from "@/components/ui/skeleton"

/**
 * `auto-fill` rather than a fixed column count: the cards keep a readable
 * floor of 18rem and a row simply holds fewer — or, on a wide warehouse
 * monitor, more — of them as the window resizes, down to one on a phone.
 * `min(…, 100%)` stops that floor from overflowing a viewport narrower than
 * a single card.
 */
export function RequestGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-6">{children}</div>
}

export function RequestListSkeleton() {
  return (
    <RequestGrid>
      {Array.from({ length: 6 }, (_, key) => (
        <Skeleton key={key} className="h-80 w-full rounded-xl" />
      ))}
    </RequestGrid>
  )
}
