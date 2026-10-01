"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { createTripAction, saveTripAction } from "@/app/(app)/trips/actions"
import { INITIAL_TRIP_DRAFT_STATE, type TripDraftState } from "@/app/(app)/trips/action-state"
import { TripDriverPanel } from "@/components/trip-driver-panel"
import { TripMovementPool } from "@/components/trip-movement-pool"
import { TripRouteCard } from "@/components/trip-route-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import { useMaterialSelection } from "@/hooks/use-material-selection"
import type { StopJob } from "@/lib/bubble/reference-types"
import { manualStopKey, renameInOrder, withManualStops } from "@/lib/trips/manual-stops"
import { invalidMaterialMessage, selectMaterialMovements } from "@/lib/trips/material-movement-types"
import type { RequestMovements } from "@/lib/trips/movement-types"
import { selectMovements } from "@/lib/trips/movement-types"
import { planTrip } from "@/lib/trips/plan"
import type { PlannedStop, TripPlan } from "@/lib/trips/plan-types"
import { DEFAULT_START_TIME } from "@/lib/trips/schedule"
import { deriveInitialSplitPreference, initialMaterialSelection, type TripDraft } from "@/lib/trips/trip-draft"
import { validatePlan } from "@/lib/trips/validate"

const EMPTY_PLAN: TripPlan = { stops: [], items: [], materials: [], noop: [], noopMaterials: [], splitChoices: [] }

/**
 * The trip builder: pick tools and material lines on the left, watch the route
 * build itself on the right, drag it into the order you'd actually drive, save.
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
  jobs,
}: {
  groups: RequestMovements[]
  /** Streamed in by its own control, so it never holds up the builder. */
  driverOptions: Promise<string[]>
  /** Every job on file — what the "Add stop" popup picks from. Streamed like `driverOptions`. */
  jobs: Promise<StopJob[]>
  /** `yyyy-mm-dd` in New York — the server knows "today", the browser shouldn't guess. */
  today: string
  /** Present when editing an existing `Planned` trip. */
  draft?: TripDraft
  /**
   * `?requestId=` — arriving from a request's own "Add to a trip" button, which
   * is the only route into here that already knows what the user wants. Seeds
   * that request's movable tools and material lines; everything else starts
   * unticked.
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
  const lines = useMaterialSelection(() => initialMaterialSelection(groups, draft, preselectRequestId))
  const [destinations, setDestinations] = useState<Map<string, string>>(() => new Map())
  const [driver, setDriver] = useState(draft?.driver ?? "")
  const [tripDate, setTripDate] = useState(draft?.tripDate ?? today)
  const [startTime, setStartTime] = useState(draft?.startTime ?? DEFAULT_START_TIME)
  const [notes, setNotes] = useState(draft?.notes ?? "")
  const [stopOrder, setStopOrder] = useState<string[]>(draft?.stopOrder ?? [])
  const [manualStops, setManualStops] = useState<string[]>(draft?.manualStops ?? [])
  const [splitPreference, setSplitPreference] = useState<Map<string, string>>(() => {
    if (!draft) return new Map()
    const { movements } = selectMovements(groups, selectedIds, destinations)
    const { materials } = selectMaterialMovements(groups, lines.quantities)
    return deriveInitialSplitPreference(movements, materials, draft.splitLocations)
  })

  const selection = useMemo(
    () => selectMovements(groups, selectedIds, destinations),
    [groups, selectedIds, destinations]
  )
  const materialSelection = useMemo(
    () => selectMaterialMovements(groups, lines.quantities),
    [groups, lines.quantities]
  )

  // Hand-added stops are laid over the fresh plan, never stored in it — the
  // same derivation the server repeats. See `withManualStops`.
  const plan = useMemo(() => {
    const planned =
      selection.movements.length + materialSelection.materials.length === 0
        ? EMPTY_PLAN
        : planTrip(selection.movements, { splitPreference }, materialSelection.materials)
    return { ...planned, ...withManualStops(planned, manualStops) }
  }, [selection, materialSelection, splitPreference, manualStops])

  // Where each ticked tool is *really* going. Usually its own group's
  // destination, but a tool that a pickup and a delivery both name travels once
  // — see `oneJourney` — and the pickup row has to say so rather than promising
  // a warehouse this trip will never visit.
  const journeys = useMemo(
    () => new Map(selection.movements.map((movement) => [movement.toolId, movement.to])),
    [selection]
  )

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

  // A draft's saved quantity can exceed what's left once another dispatcher has
  // planned part of the line; that is refused by name here as on the server.
  const problems = validatePlan(stops, plan.items, plan.materials)
  const blockingProblem =
    state.status === "error" || state.status === "invalid"
      ? state.message
      : materialSelection.invalid.length > 0
        ? invalidMaterialMessage(materialSelection.invalid)
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
    lines.setAll(group.materials, checked)
  }

  // A stop already on the route keeps its dragged place when it turns manual
  // (or back) — its key changes, so the order is renamed with it.
  function addStop(location: string) {
    setManualStops((current) => (current.includes(location) ? current : [...current, location]))
    setStopOrder((order) => renameInOrder(order, location, manualStopKey(location)))
  }

  function removeStop(location: string) {
    setManualStops((current) => current.filter((entry) => entry !== location))
    setStopOrder((order) => renameInOrder(order, manualStopKey(location), location))
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
        materials: [...lines.quantities].map(([lineId, qty]) => ({ lineId, qty })),
        manualStops,
        stops,
        items: plan.items,
        plannedMaterials: plan.materials,
        splitPreference: plan.splitChoices.map((choice) => ({ key: choice.key, chosen: choice.chosen })),
      }

      const result = draft
        ? await saveTripAction({ ...payload, tripId: draft.tripId })
        : await createTripAction({ ...payload, idempotencyKey: crypto.randomUUID() })

      setState(result)

      if (result.status === "saved") {
        const cargo = [result.tools ? `${result.tools} tools` : null, result.materials ? `${result.materials} materials` : null]
        toast.add({
          title: `${draft ? "Trip updated" : "Trip saved"}${result.warning ? ", with a warning" : ""}`,
          description:
            result.warning ??
            `${cargo.filter(Boolean).join(", ") || "Nothing to carry yet"} over ${result.stops} stops. Nothing has moved yet — start the trip when the driver leaves.`,
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
          <CardTitle>What to move</CardTitle>
          <CardDescription>
            Pick individual tools and how much of each material — a request can be split across as many trips as it
            takes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TripMovementPool
            groups={groups}
            selectedIds={selectedIds}
            materialQty={lines.quantities}
            destinations={destinations}
            journeys={journeys}
            onToggle={toggle}
            onToggleMaterial={lines.toggle}
            onMaterialQtyChange={lines.setQty}
            onToggleGroup={toggleGroup}
            onDestinationChange={(requestId, warehouse) =>
              setDestinations((current) => new Map(current).set(requestId, warehouse))
            }
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <TripRouteCard
          stops={stops}
          items={plan.items}
          materials={plan.materials}
          startTime={startTime}
          splitChoices={plan.splitChoices}
          jobs={jobs}
          manualStops={manualStops}
          pending={pending}
          onReorder={(next: PlannedStop[]) => setStopOrder(next.map((stop) => stop.stopKey))}
          onFlipSplit={(key, location) => setSplitPreference((current) => new Map(current).set(key, location))}
          onAddStop={addStop}
          onRemoveStop={removeStop}
        />

        <Card size="sm">
          <CardContent>
            <TripDriverPanel
              driver={driver}
              driverOptions={driverOptions}
              tripDate={tripDate}
              startTime={startTime}
              notes={notes}
              toolCount={plan.items.length}
              materialCount={plan.materials.length}
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
