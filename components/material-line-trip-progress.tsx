import { PackageXIcon, UndoIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { LineProgress } from "@/lib/bubble/requested-materials-types"
import type { TripFlag } from "@/lib/trips/plan-types"

/**
 * How far one material line has got on trips, beside its assigned figure on
 * the request page: `3 on trips · delivered 12 of 20`, and the last trip's
 * verdict as a flag.
 *
 * "On trips" is what is still moving — planned, in the van or turned away and
 * riding home — so it never counts the delivered units twice.
 *
 * The flags are the tool ones, in the tool colours: **Refused** when a site
 * turned the line away (it stays after the units are back in the yard, so
 * nobody sends it straight back), **Not loaded** when the driver reached the
 * collect and left it. Putting the line on a new trip clears either.
 */
export function MaterialLineTripProgress({ progress, flag }: { progress: LineProgress; flag?: TripFlag }) {
  const moving = progress.onTrips - progress.delivered
  if (moving <= 0 && progress.delivered === 0 && !flag) return null

  return (
    <>
      {moving > 0 && <span className="tabular-nums">· {moving} on trips</span>}
      {(progress.delivered > 0 || moving > 0) && (
        <span className="tabular-nums">
          · delivered {progress.delivered} of {progress.requested}
        </span>
      )}
      {flag === "refused" && (
        <Badge className="border-transparent bg-status-attention text-white">
          <UndoIcon />
          Refused
        </Badge>
      )}
      {flag === "skipped" && (
        <Badge className="border-transparent bg-status-attention text-white">
          <PackageXIcon />
          Not loaded
        </Badge>
      )}
    </>
  )
}
