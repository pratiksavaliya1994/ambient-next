import Link from "next/link"
import { MapPinIcon, WrenchIcon } from "lucide-react"

import { TripStatusBadge } from "@/components/trip-status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { stopWork, type TripDetail } from "@/lib/bubble/trips-types"
import { formatClock, minutesOfTime, tripStartTime } from "@/lib/trips/schedule"

/** Initials for the driver avatar — first and last word, matching `DriverTripCard`. */
function driverInitials(name: string) {
  const words = name.trim().split(/\s+/)
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase()
}

/**
 * One trip on the board: who, when, how big, and where it goes.
 *
 * The route line is the whole card's point — `Warehouse → 107 Greenwich →
 * Warehouse` tells a dispatcher more at a glance than a count of requests ever
 * did, and it is only readable because a trip is now a list of places.
 */
export function TripCard({ trip }: { trip: TripDetail }) {
  const work = stopWork(trip)
  const route = work.map((entry) => entry.stop.location)

  return (
    <Card size="sm" className="transition-colors hover:border-primary/40">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{driverInitials(trip.driver ?? "?")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">
              <Link href={`/trips/${trip.id}`} className="after:absolute after:inset-0">
                {trip.driver ?? "No driver"}
              </Link>
            </CardTitle>
            <p className="text-xs text-muted-foreground tabular-nums">
              {trip.tripDate
                ? `${newYorkDayLabel(trip.tripDate)} · ${formatClock(minutesOfTime(tripStartTime(trip.tripDate)))}`
                : "No date"}
            </p>
          </div>
          <TripStatusBadge status={trip.status} className="shrink-0" />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 wrap-anywhere">{route.join(" → ") || "No stops"}</span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <WrenchIcon className="size-3.5 shrink-0" />
          {trip.items.length} {trip.items.length === 1 ? "tool" : "tools"} · {work.length}{" "}
          {work.length === 1 ? "stop" : "stops"}
        </p>
      </CardContent>
    </Card>
  )
}
