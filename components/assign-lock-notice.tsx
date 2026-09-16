"use client"

import Link from "next/link"
import { LockIcon, TruckIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { ToolTripClaim } from "@/lib/bubble/assigned-tools-types"

/**
 * Why some rows on the assign screen have no remove control — said once, at the
 * top, rather than leaving a PM to work out why an X is missing.
 *
 * **Two reasons, kept apart, because what to do about them differs.** A tool
 * that has already *gone out* is final: nothing brings it back off the request
 * from here, and the only move left is to add whatever is still missing. A tool
 * a saved trip is merely *carrying* is not final — the trip is the thing
 * holding it, so the way out is to edit or cancel that trip, and the notice
 * links straight to it.
 *
 * The two overlap on a tool mid-trip (out on the road *and* claimed); the
 * caller resolves that in favour of "gone out", the stronger statement.
 *
 * Only tools actually on this request count. A locked tool that merely shares a
 * requested type is somebody else's business.
 */
export function AssignLockNotice({ gone, claimed }: { gone: number; claimed: ToolTripClaim[] }) {
  // One line per trip, not per tool: two tools on Rosa's trip is one thing to
  // go and fix. First claim wins the driver label — they all name the same trip.
  const trips = [...new Map(claimed.map((claim) => [claim.tripId, claim])).values()]
  const one = claimed.length === 1

  return (
    <>
      {gone > 0 && (
        <Alert>
          <LockIcon />
          <AlertTitle>
            {gone === 1 ? "One tool has already gone out" : `${gone} tools have already gone out`}
          </AlertTitle>
          <AlertDescription>
            They stay on the request and can&rsquo;t be removed here. Anything still missing can be added as
            normal — it goes out on the next trip.
          </AlertDescription>
        </Alert>
      )}

      {claimed.length > 0 && (
        <Alert>
          <TruckIcon />
          <AlertTitle>
            {one ? "One tool is already on a trip" : `${claimed.length} tools are already on a trip`}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-1.5">
            <span>
              {one
                ? "The trip is counting on it, so it can't be removed here — take it off that trip first, or cancel the trip."
                : "The trip is counting on them, so they can't be removed here — take them off that trip first, or cancel the trip."}
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {trips.map((trip) => (
                <Link key={trip.tripId} href={`/trips/${trip.tripId}`} className="text-foreground">
                  {trip.driver ?? "Unassigned"}&rsquo;s trip
                  {/* A trip already out can't be edited — `save-trip` runs on a
                      `Planned` trip only — so say so rather than sending a PM
                      to a page with no Edit button. */}
                  {trip.started && " — already out"}
                </Link>
              ))}
            </span>
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
