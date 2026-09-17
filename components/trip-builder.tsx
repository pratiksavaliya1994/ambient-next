"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { createTripAction, saveTripAction } from "@/app/(app)/trips/actions"
import { INITIAL_TRIP_DRAFT_STATE, type TripDraftState } from "@/app/(app)/trips/action-state"
import { TripDriverPanel } from "@/components/trip-driver-panel"
import { TripMovementPool } from "@/components/trip-movement-pool"
import { TripPlanPreview } from "@/components/trip-plan-preview"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { toast } from "@/components/ui/toast"
import type { RequestMovements } from "@/lib/trips/movement-types"
import { selectMovements } from "@/lib/trips/movement-types"
import { planTrip } from "@/lib/trips/plan"
import type { Movement, PlannedStop } from "@/lib/trips/plan-types"
import { DEFAULT_START_TIME, formatClock, minutesOfTime } from "@/lib/trips/schedule"
import { validatePlan } from "@/lib/trips/validate"

export type TripDraft = {
  tripId: string
  driver: string
  tripDate: string
  /** `"HH:mm"` — the saved trip's departure time, read back off its `tripDate` instant. */
  startTime: string
  notes: string
  toolIds: string[]
  stopOrder: string[]
  /** Locations that appeared twice among the saved trip's stops — i.e. the side of a cycle it split. */
  splitLocations: string[]
}

/**
 * Reconstructs which side of each circular pickup/drop the saved trip split,
 * purely from its stop locations — there is no Bubble field for this, so a
 * location that was visited twice at save time is the only evidence left.
 *
 * Runs once, against a plan seeded with no preference: `SplitChoice.key` only
 * depends on the movement graph, not on which side got picked, so the default
 * plan's `splitChoices` already names every cycle this trip could have split,
 * and `draft.splitLocations` says which one it actually did.
 */
function deriveInitialSplitPreference(movements: readonly Movement[], splitLocations: readonly string[]) {
  const preference = new Map<string, string>()
  if (movements.length === 0 || splitLocations.length === 0) return preference

  const saved = new Set(splitLocations)
  for (const choice of planTrip(movements).splitChoices) {
    if (saved.has(choice.chosen)) continue
    const actual = choice.candidates.find((location) => location !== choice.chosen && saved.has(location))
    if (actual) preference.set(choice.key, actual)
  }
  return preference
}

/**
 * The trip builder: pick tools on the left, watch the route build itself on the
 * right, drag it into the order you'd actually drive, save.
 *
 * **The route is derived, never stored in state.** `planTrip` runs on every
 * tick from the current selection, so there is no second copy of the plan to
 * drift out of sync — which is also why there is no `useEffect` here. The one
 * thing the user contributes that the algorithm cannot is *order*, and that is
 * held as a list of `stopKey`s (`stopOrder`) and applied over the fresh plan.
 *
 * That works only because `planTrip`'s keys are **deterministic** — the same
 * selection produces the same keys here and again on the server, which is what
 * lets a dragged order survive the round trip. See `lib/trips/plan.ts`.
 */
export function TripBuilder({
  groups,
  driverOptions,
  today,
  draft,
  preselectRequestId,
}: {
  groups: RequestMovements[]
  driverOptions: string[]
  /** `yyyy-mm-dd` in New York — the server knows "today", the browser shouldn't guess. */
  today: string
  /** Present when editing an existing `Planned` trip. */
  draft?: TripDraft
  /**
   * `?requestId=` — arriving from a request's own "Add to a trip" button, which
   * is the only route into here that already knows what the user wants. Seeds
   * that request's movable tools; everything else starts unticked.
   */
  preselectRequestId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<TripDraftState>(INITIAL_TRIP_DRAFT_STATE)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (draft) return new Set(draft.toolIds)
    const seeded = groups
      .filter((group) => group.requestId === preselectRequestId)
      .flatMap((group) => group.movements.filter((movement) => movement.block === null))
      .map((movement) => movement.toolId)
    return new Set(seeded)
  })
  const [destinations, setDestinations] = useState<Map<string, string>>(() => new Map())
  const [driver, setDriver] = useState(draft?.driver ?? "")
  const [tripDate, setTripDate] = useState(draft?.tripDate ?? today)
  const [startTime, setStartTime] = useState(draft?.startTime ?? DEFAULT_START_TIME)
  const [notes, setNotes] = useState(draft?.notes ?? "")
  const [stopOrder, setStopOrder] = useState<string[]>(draft?.stopOrder ?? [])
  const [splitPreference, setSplitPreference] = useState<Map<string, string>>(() => {
    if (!draft) return new Map()
    const { movements } = selectMovements(groups, selectedIds, destinations)
    return deriveInitialSplitPreference(movements, draft.splitLocations)
  })

  const plan = useMemo(() => {
    const { movements } = selectMovements(groups, selectedIds, destinations)
    if (movements.length === 0) return { stops: [], items: [], noop: [], splitChoices: [] }
    return planTrip(movements, { splitPreference })
  }, [groups, selectedIds, destinations, splitPreference])

  // The dispatcher's arrangement, applied over the freshly-planned stops. A
  // stop they never saw sorts to the end rather than being dropped, where the
  // order check will flag it if that position is actually wrong.
  const stops = useMemo(() => {
    const position = new Map(stopOrder.map((stopKey, index) => [stopKey, index]))
    return [...plan.stops]
      .sort(
        (a, b) =>
          (position.get(a.stopKey) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.stopKey) ?? Number.MAX_SAFE_INTEGER) ||
          a.seq - b.seq
      )
      .map((stop, index) => ({ ...stop, seq: index + 1 }))
  }, [plan.stops, stopOrder])

  const problems = validatePlan(stops, plan.items)
  const blockingProblem =
    state.status === "error" || state.status === "invalid"
      ? state.message
      : (problems.find((problem) => problem.kind !== "empty")?.message ?? null)

  function toggle(toolId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(toolId)
      else next.delete(toolId)
      return next
    })
  }

  function toggleGroup(group: RequestMovements, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const movement of group.movements) {
        if (movement.block) continue
        if (checked) next.add(movement.toolId)
        else next.delete(movement.toolId)
      }
      return next
    })
  }

  function reorder(next: PlannedStop[]) {
    setStopOrder(next.map((stop) => stop.stopKey))
  }

  function flipSplit(key: string, location: string) {
    setSplitPreference((current) => new Map(current).set(key, location))
  }

  function save() {
    startTransition(async () => {
      const payload = {
        driver: driver.trim(),
        tripDate,
        startTime,
        notes,
        toolIds: [...selectedIds],
        destinations: groups
          .filter((group) => group.destinationIsChoosable)
          .map((group) => ({
            requestId: group.requestId,
            warehouse: destinations.get(group.requestId) ?? group.destination,
          })),
        stops,
        items: plan.items,
        splitPreference: plan.splitChoices.map((choice) => ({ key: choice.key, chosen: choice.chosen })),
      }

      const result = draft
        ? await saveTripAction({ ...payload, tripId: draft.tripId })
        : await createTripAction({ ...payload, idempotencyKey: crypto.randomUUID() })

      setState(result)

      if (result.status === "saved") {
        toast.add({
          title: result.warning
            ? draft
              ? "Trip updated, with a warning"
              : "Trip saved, with a warning"
            : draft
              ? "Trip updated"
              : "Trip saved",
          description:
            result.warning ??
            `${result.tools} tools over ${result.stops} stops. Nothing has moved yet — start the trip when the driver leaves.`,
        })
        router.push(`/trips/${result.tripId}`)
      }
    })
  }

  return (
    // 60/40. `minmax(0, …)` on both, or a long job name or location refuses to
    // truncate and pushes its column past the split.
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Tools to move</CardTitle>
          <CardDescription>
            Pick individual tools — a request can be split across as many trips as it takes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TripMovementPool
            groups={groups}
            selectedIds={selectedIds}
            destinations={destinations}
            onToggle={toggle}
            onToggleGroup={toggleGroup}
            onDestinationChange={(requestId, warehouse) =>
              setDestinations((current) => new Map(current).set(requestId, warehouse))
            }
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Route</CardTitle>
            {/* The departure is repeated here, above the stops it times, because
                the control that sets it lives in the panel *below* this card —
                without it you change a time out of sight of its effect. */}
            <CardDescription>
              Leaves {formatClock(minutesOfTime(startTime))} &mdash; drag a stop to change the order you&rsquo;d drive
              it, and the times follow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stops.length === 0 ? (
              <Empty className="border border-dashed py-8">
                <EmptyHeader>
                  <EmptyTitle>No stops yet</EmptyTitle>
                  <EmptyDescription>Pick a tool and the route builds itself.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <TripPlanPreview
                stops={stops}
                items={plan.items}
                startTime={startTime}
                splitChoices={plan.splitChoices}
                onReorder={reorder}
                onFlipSplit={flipSplit}
                disabled={pending}
              />
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent>
            <TripDriverPanel
              driver={driver}
              driverOptions={driverOptions}
              tripDate={tripDate}
              startTime={startTime}
              notes={notes}
              toolCount={plan.items.length}
              stopCount={stops.length}
              problem={blockingProblem}
              pending={pending}
              saveLabel={draft ? "Save changes" : "Save trip"}
              onDriverChange={setDriver}
              onDateChange={setTripDate}
              onStartTimeChange={setStartTime}
              onNotesChange={setNotes}
              onSave={save}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
