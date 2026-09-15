"use client"

import { useState, useTransition } from "react"
import { CheckIcon, ListOrderedIcon, XIcon } from "lucide-react"

import { setStopOrderAction } from "@/app/(app)/dispatch/active/actions"
import { INITIAL_STOP_ORDER_STATE, type StopOrderState } from "@/app/(app)/dispatch/active/action-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { TripStopList } from "@/components/trip-stop-list"
import { TripStopSortableList } from "@/components/trip-stop-sortable-list"
import type { DriverTrip } from "@/lib/dispatch/summary"

function driverInitials(driverName: string) {
  const words = driverName.trim().split(/\s+/)
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase()
}

/**
 * One driver's trip: their stops in route order, and the edit mode that sets
 * that order.
 *
 * The card *is* the trip — there is no trip id in Bubble, so a driver's whole
 * `In Transit` load is one route even when it arrived as two dispatches. Stops
 * added later come in unsequenced and sort to the end by time until someone
 * renumbers the lot.
 *
 * Dragging only moves local state; nothing is written until Save, which sends
 * the whole route in one call. Same arrange-then-commit shape as
 * `components/assign-tools-panel.tsx`, down to deriving `dirty` from props so
 * a successful save's revalidation disables the button on its own.
 */
export function DriverTripCard({ trip }: { trip: DriverTrip }) {
  const [stops, setStops] = useState(trip.stops)
  const [editing, setEditing] = useState(false)
  const [state, setState] = useState<StopOrderState>(INITIAL_STOP_ORDER_STATE)
  const [pending, startTransition] = useTransition()

  const dirty = stops.map((stop) => stop.id).join(",") !== trip.stops.map((stop) => stop.id).join(",")
  // A one-stop trip has no order to set, and a driverless bucket can't be
  // re-read by the action's `equals` constraint — see `DriverTrip`.
  const canReorder = trip.driver !== null && trip.stops.length > 1

  function reset() {
    setStops(trip.stops)
    setState(INITIAL_STOP_ORDER_STATE)
  }

  function save() {
    if (!trip.driver) return
    startTransition(async () => {
      const result = await setStopOrderAction({ driver: trip.driver, requestIds: stops.map((stop) => stop.id) })
      setState(result)

      if (result.status === "ordered") {
        toast.add({ title: "Route saved", description: `${result.count} stops in order for ${trip.driver}.` })
        setEditing(false)
      }
    })
  }

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{driverInitials(trip.driver ?? "?")}</AvatarFallback>
          </Avatar>
          <CardTitle>{trip.driver ?? "Unknown driver"}</CardTitle>
        </div>
        <CardAction>
          {canReorder && !editing ? (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditing(true)}>
              <ListOrderedIcon />
              Edit order
            </Button>
          ) : (
            <Badge variant="outline" className="tabular-nums">
              {stops.length} {stops.length === 1 ? "stop" : "stops"}
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Always the local copy, in both modes: if Bubble's write lands
            asynchronously the revalidated read can briefly still hold the old
            order, and the route shouldn't visibly snap back to it. */}
        {editing ? (
          <TripStopSortableList stops={stops} onReorder={setStops} disabled={pending} />
        ) : (
          <TripStopList stops={stops} />
        )}

        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        {editing && (
          <div className="sticky bottom-0 flex items-center justify-between gap-2 rounded-lg border bg-card/95 p-2 backdrop-blur">
            <span className="text-xs text-muted-foreground">{dirty ? "Unsaved order" : "Drag a stop to reorder"}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  reset()
                  setEditing(false)
                }}
              >
                <XIcon />
                Cancel
              </Button>
              <Button size="sm" disabled={!dirty || pending} onClick={save}>
                {pending ? <Spinner /> : <CheckIcon />}
                Save order
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
