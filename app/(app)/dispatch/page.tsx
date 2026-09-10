import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ListIcon } from "lucide-react"

import { DispatchBoard } from "@/components/dispatch-board"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { listFieldPms, listUsers } from "@/lib/bubble/reference"
import { listRequestsByStatus } from "@/lib/bubble/requests"
import { toDispatchSummaries } from "@/lib/dispatch/summary"

export const metadata: Metadata = { title: "Dispatch" }

/**
 * The board a driver/PM dispatches from: requests at `Assigned`, checked off
 * to go out under one driver. The trips already under way live on their own
 * screen, `/dispatch/active` (`app/(app)/dispatch/active/page.tsx`) — this
 * page only links there, and only fetches the count needed for that link.
 *
 * **Frontend only for now.** `update-request-status` — the Bubble workflow
 * that would move `request.status` (and every assigned tool) to `In Transit`
 * — isn't built yet, so `DispatchBoard` renders a working picker with the
 * Dispatch button disabled. See `docs/phase-2bc-dispatch-offload.md`.
 *
 * The reads themselves are cheap enough that the doc calls out no
 * `<Suspense>` split is needed, unlike the assign screen's much heavier read
 * set — one is kept anyway, matching `/requests` and `/tools`, so navigating
 * here shows a fallback rather than a blank beat.
 *
 * `?requestId=` lets the request detail page's own `Dispatch` button land
 * here with that request already checked, since a per-request dispatch route
 * doesn't exist — `DispatchBoard` seeds its selection from it.
 */
export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string }>
}) {
  const { requestId } = await searchParams

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            Send assigned requests out with a driver, and see what&rsquo;s already on the road.
          </p>
        </div>
        <Link
          href="/requests"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          <ListIcon />
          Requests
        </Link>
      </div>

      <Suspense fallback={<DispatchSkeleton />}>
        <DispatchBody preselectedId={requestId} />
      </Suspense>
    </div>
  )
}

async function DispatchBody({ preselectedId }: { preselectedId?: string }) {
  const [assigned, inTransitCount, pms, users] = await Promise.all([
    listRequestsByStatus("Assigned"),
    listRequestsByStatus("In Transit").then((requests) => requests.length),
    listFieldPms(),
    listUsers(),
  ])

  const assignedRequests = (await toDispatchSummaries(assigned)).sort((a, b) =>
    (a.start ?? "").localeCompare(b.start ?? "")
  )

  // `pms` and `user` are both offered — neither is an actual driver roster
  // (see the doc's open question), so this is a quick-pick convenience and
  // `driver` stays free text either way.
  const driverOptions = [...new Set([...pms.map((pm) => pm.name), ...users.map((user) => user.name)])].sort((a, b) =>
    a.localeCompare(b)
  )

  return (
    <DispatchBoard
      assignedRequests={assignedRequests}
      activeTripCount={inTransitCount}
      driverOptions={driverOptions}
      preselectedId={preselectedId}
    />
  )
}

function DispatchSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
}
