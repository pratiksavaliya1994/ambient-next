import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeftIcon } from "lucide-react"

import { TripBuilder } from "@/components/trip-builder"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { newYorkToday } from "@/lib/bubble/dates"
import { listFieldPms, listUsers } from "@/lib/bubble/reference"
import { shownMovements } from "@/lib/trips/movement-types"
import { listOutstandingMovements } from "@/lib/trips/movements"

export const metadata: Metadata = { title: "New trip" }

/**
 * Build a trip from the tools waiting to move.
 *
 * Saving writes a **`Planned` draft and nothing else** — no `tools` row moves,
 * no `request.status` changes. That is what makes planning tomorrow's routes
 * today safe, and a mistake reversible right up until someone presses Start.
 */
export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string }>
}) {
  const { requestId } = await searchParams

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">New trip</h1>
          <p className="text-sm text-muted-foreground">
            Pick the tools to move. The route builds itself; drag it into the order you&rsquo;d drive.
          </p>
        </div>
        <Link
          href="/trips"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          <ArrowLeftIcon />
          Trips
        </Link>
      </div>

      <Suspense fallback={<BuilderSkeleton />}>
        <NewTripBody preselectRequestId={requestId} />
      </Suspense>
    </div>
  )
}

async function NewTripBody({ preselectRequestId }: { preselectRequestId?: string }) {
  const [groups, pms, users] = await Promise.all([listOutstandingMovements(), listFieldPms(), listUsers()])

  // `pms` and `user` merged, as the dispatch board did: neither is an actual
  // driver roster — no such table exists in Bubble — so this is a quick-pick
  // convenience and `trip.driver` stays free text either way.
  const driverOptions = [...new Set([...pms.map((pm) => pm.name), ...users.map((user) => user.name)])].sort((a, b) =>
    a.localeCompare(b)
  )

  return (
    <TripBuilder
      groups={shownMovements(groups)}
      driverOptions={driverOptions}
      today={newYorkToday()}
      preselectRequestId={preselectRequestId}
    />
  )
}

function BuilderSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Skeleton className="h-96 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  )
}
