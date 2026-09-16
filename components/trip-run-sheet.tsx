"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FlagIcon, TruckIcon, XIcon } from "lucide-react"

import { cancelTripAction } from "@/app/(app)/trips/actions"
import { completeTripAction, startTripAction } from "@/app/(app)/trips/[tripId]/actions"
import { INITIAL_TRIP_RUN_STATE, type TripRunState } from "@/app/(app)/trips/action-state"
import { TripStopCard } from "@/components/trip-stop-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { isStopDone, stillLoaded, stopWork, type TripDetail } from "@/lib/bubble/trips-types"
import { tripStartTime } from "@/lib/trips/schedule"

/**
 * A trip's stops, in route order, with the two buttons that bracket a run.
 *
 * **This is the screen that replaced "active trips grouped by driver".** The
 * old one listed a driver's requests and hid any collect-from-another-site
 * inside the request it served, so a driver could read the card and still not
 * know where to go first. Here the unit is a place, in the order you drive it.
 *
 * Start and Complete live here rather than on each stop because they bracket
 * the whole run; per-stop recording is inside `TripStopCard`.
 */
export function TripRunSheet({ trip }: { trip: TripDetail }) {
  const router = useRouter()
  const [state, setState] = useState<TripRunState>(INITIAL_TRIP_RUN_STATE)
  const [pending, startTransition] = useTransition()

  const work = stopWork(trip)
  const [first] = work
  const startTime = tripStartTime(trip.tripDate)
  const onboard = stillLoaded(trip.items)
  const live = trip.status === "In Transit"
  // Where the driver has got to: the first stop with anything still outstanding.
  // `-1` on a trip that isn't running, so a plan highlights nothing.
  const currentIndex = live ? work.findIndex((entry) => !isStopDone(entry)) : -1

  function run(action: () => Promise<TripRunState>, onDone: (result: TripRunState) => void) {
    startTransition(async () => {
      const result = await action()
      setState(result)
      onDone(result)
    })
  }

  function start() {
    run(
      () => startTripAction({ tripId: trip.id }),
      (result) => {
        if (result.status !== "started") return
        toast.add({
          title: "Trip started",
          description: first ? `First stop: ${first.stop.location}.` : `${trip.driver} is on the road.`,
        })
        if (result.warning) toast.add({ title: "Check the requests", description: result.warning })
      }
    )
  }

  function finish() {
    run(
      () => completeTripAction({ tripId: trip.id }),
      (result) => {
        if (result.status !== "completed") return
        toast.add({ title: "Trip completed", description: `${trip.driver}'s route is done.` })
        if (result.warning) toast.add({ title: "Check the requests", description: result.warning })
      }
    )
  }

  function cancel() {
    run(
      () => cancelTripAction({ tripId: trip.id }).then((result) => mapDraftState(result)),
      (result) => {
        if (result.status !== "cancelled") return
        toast.add({ title: "Trip cancelled", description: "Nothing had moved, so nothing was undone." })
        router.push("/trips")
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col">
        {work.map((entry, index) => (
          <TripStopCard
            key={entry.stop.stopKey}
            tripId={trip.id}
            work={entry}
            position={index + 1}
            startTime={startTime}
            last={index === work.length - 1}
            current={index === currentIndex}
            live={live && !pending}
          />
        ))}
      </ol>

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {trip.status === "Planned" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Nothing has moved yet. Starting the trip sends {trip.driver ?? "the driver"} to{" "}
            {first ? first.stop.location : "the first stop"} — tools move as each stop is recorded.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={cancel} disabled={pending}>
              <XIcon />
              Cancel trip
            </Button>
            <Button onClick={start} disabled={pending || !trip.driver}>
              {pending ? <Spinner /> : <TruckIcon />}
              Start trip
            </Button>
          </div>
        </div>
      )}

      {live && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {onboard.length === 0
              ? "Every tool has been dealt with."
              : `${onboard.length} ${onboard.length === 1 ? "tool is" : "tools are"} still on the truck.`}
          </p>
          <Button onClick={finish} disabled={pending || onboard.length > 0}>
            {pending ? <Spinner /> : <FlagIcon />}
            Finish trip
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * `cancelTripAction` answers in the draft vocabulary (it is a write to the
 * plan, not to the run), so its result is translated rather than the run sheet
 * carrying a second state union.
 */
function mapDraftState(result: { status: string; message?: string }): TripRunState {
  if (result.status === "saved") return { status: "cancelled" }
  return { status: "error", message: result.message ?? "That trip couldn't be cancelled." }
}
