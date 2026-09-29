"use client"

import { TripAddStopDialog } from "@/components/trip-add-stop-dialog"
import { TripPlanPreview } from "@/components/trip-plan-preview"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { StopJob } from "@/lib/bubble/reference-types"
import type { PlannedItem, PlannedMaterial, PlannedStop, SplitChoice } from "@/lib/trips/plan-types"
import { formatClock, minutesOfTime } from "@/lib/trips/schedule"

/**
 * The builder's right-hand route: the stops in driving order, and the "Add
 * stop" popup for a job the picked cargo doesn't reach.
 *
 * Split out of `TripBuilder` to keep that file under its cap. It holds no
 * state: the builder owns the stop order and the hand-added stops.
 */
export function TripRouteCard({
  stops,
  items,
  materials,
  startTime,
  splitChoices,
  jobs,
  manualStops,
  pending,
  onReorder,
  onFlipSplit,
  onAddStop,
  onRemoveStop,
}: {
  stops: PlannedStop[]
  items: PlannedItem[]
  materials: PlannedMaterial[]
  startTime: string
  splitChoices: SplitChoice[]
  jobs: readonly StopJob[]
  manualStops: readonly string[]
  pending: boolean
  onReorder: (stops: PlannedStop[]) => void
  onFlipSplit: (key: string, location: string) => void
  onAddStop: (location: string) => void
  onRemoveStop: (location: string) => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Route</CardTitle>
        {/* The departure is repeated here, above the stops it times, because
            the control that sets it lives in the panel *below* this card —
            without it you change a time out of sight of its effect. */}
        <CardDescription>
          Leaves {formatClock(minutesOfTime(startTime))} &mdash; drag a stop to change the order you&rsquo;d drive it,
          and the times follow.
        </CardDescription>
        <CardAction>
          <TripAddStopDialog jobs={jobs} taken={new Set(manualStops)} disabled={pending} onAdd={onAddStop} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {stops.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyTitle>No stops yet</EmptyTitle>
              <EmptyDescription>
                Pick a tool or a material and the route builds itself, or add a stop by hand.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <TripPlanPreview
            stops={stops}
            items={items}
            materials={materials}
            startTime={startTime}
            splitChoices={splitChoices}
            onReorder={onReorder}
            onFlipSplit={onFlipSplit}
            onRemoveStop={onRemoveStop}
            disabled={pending}
          />
        )}
      </CardContent>
    </Card>
  )
}
