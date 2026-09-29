"use client"

import { useState, useTransition } from "react"
import { MapPinCheckIcon } from "lucide-react"

import { markStopDoneAction } from "@/app/(app)/trips/[tripId]/stop-done-action"
import { INITIAL_TRIP_RUN_STATE, type TripRunState } from "@/app/(app)/trips/action-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

/**
 * The one control on a stop with nothing to collect or drop: "I've been here".
 *
 * No confirm dialog, unlike `TripStopActions`: nothing moves, so a slip costs
 * a stop marked done early, not a tool recorded in the wrong place.
 */
export function TripStopMarkDone({ tripId, stopKey, location }: { tripId: string; stopKey: string; location: string }) {
  const [state, setState] = useState<TripRunState>(INITIAL_TRIP_RUN_STATE)
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result = await markStopDoneAction({ tripId, stopKey })
      setState(result)
      if (result.status === "stop-marked") toast.add({ title: `${location} done` })
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button size="sm" onClick={submit} disabled={pending}>
        {pending ? <Spinner /> : <MapPinCheckIcon />}
        Mark as done
      </Button>
    </div>
  )
}
