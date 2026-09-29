"use client"

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent, Modifier } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"

import { TripPlanStop } from "@/components/trip-plan-stop"
import type { PlannedItem, PlannedMaterial, PlannedStop, SplitChoice } from "@/lib/trips/plan-types"
import { violatingStopKeys } from "@/lib/trips/validate"

/**
 * For each cycle `planTrip` resolved by splitting a node, the *other*
 * candidate locations it could have split instead — but only while that
 * location is still merged into a single stop. Once it *is* the split one,
 * the flip control moves to whichever location is merged now, which is what
 * makes this a two-way toggle rather than a one-shot action.
 */
function flipTargetsByLocation(
  stops: readonly PlannedStop[],
  splitChoices: readonly SplitChoice[]
): Map<string, { key: string; location: string }> {
  const occurrences = new Map<string, number>()
  for (const stop of stops) occurrences.set(stop.location, (occurrences.get(stop.location) ?? 0) + 1)

  const targets = new Map<string, { key: string; location: string }>()
  for (const choice of splitChoices) {
    for (const location of choice.candidates) {
      if (location === choice.chosen) continue
      if (occurrences.get(location) !== 1) continue
      targets.set(location, { key: choice.key, location })
    }
  }
  return targets
}

/**
 * The route being built: stops in order, each showing what is collected and
 * what is dropped there.
 *
 * **This is the screen the whole phase exists for.** The old Active-trips card
 * listed requests and buried a request's collect-from-another-site under it;
 * here a stop is a place, and both halves of the work at that place sit
 * together. A driver reads it top to bottom.
 *
 * Dragging only moves local state — nothing is written until Save, the same
 * arrange-then-commit shape `DriverTripCard` and `AssignToolsPanel` both use.
 * A drag that breaks precedence (a tool dropped before it is collected) is
 * **flagged, not refused**: blocking a drag mid-gesture feels broken, and the
 * save is guarded anyway, on both this side and the server's. Vertical lock
 * inline rather than pulling in `@dnd-kit/modifiers` for one function.
 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function TripPlanPreview({
  stops,
  items,
  materials,
  startTime,
  splitChoices,
  onReorder,
  onFlipSplit,
  onRemoveStop,
  disabled = false,
}: {
  stops: PlannedStop[]
  items: PlannedItem[]
  materials: PlannedMaterial[]
  /** The trip's `"HH:mm"` departure — every stop's time counts forward from it. */
  startTime: string
  /** Every circular pickup/drop `planTrip` had to resolve by splitting a stop, and what else it could have split. */
  splitChoices: SplitChoice[]
  onReorder: (stops: PlannedStop[]) => void
  /** The dispatcher chose to split `location` instead, for the cycle identified by `key`. */
  onFlipSplit: (key: string, location: string) => void
  /** Takes a hand-added stop off the route, by its job name. */
  onRemoveStop: (location: string) => void
  disabled?: boolean
}) {
  // The distance threshold is what stops a vertical scroll gesture being
  // swallowed as a drag; dnd-kit only sets `touch-action: none` on the grip.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } })
  )

  const flagged = violatingStopKeys(stops, items, materials)
  const flipTargets = flipTargetsByLocation(stops, splitChoices)

  function move(from: number, to: number) {
    if (to < 0 || to >= stops.length) return
    onReorder(arrayMove(stops, from, to).map((stop, index) => ({ ...stop, seq: index + 1 })))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    move(
      stops.findIndex((stop) => stop.stopKey === active.id),
      stops.findIndex((stop) => stop.stopKey === over.id)
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={stops.map((stop) => stop.stopKey)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2">
          {stops.map((stop, index) => (
            <TripPlanStop
              key={stop.stopKey}
              stop={stop}
              position={index + 1}
              isLast={index === stops.length - 1}
              items={items}
              materials={materials}
              startTime={startTime}
              flagged={flagged.has(stop.stopKey)}
              disabled={disabled}
              onMoveUp={() => move(index, index - 1)}
              onMoveDown={() => move(index, index + 1)}
              flipTarget={flipTargets.get(stop.location)}
              onFlip={onFlipSplit}
              onRemove={onRemoveStop}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}
