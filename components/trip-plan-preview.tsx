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
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeftRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  MapPinIcon,
  WarehouseIcon,
} from "lucide-react"

import { StopTimeBadge } from "@/components/stop-time"
import { TripStopItems } from "@/components/trip-stop-items"
import { StopNumber } from "@/components/stop-number"
import { Button } from "@/components/ui/button"
import type { PlannedItem, PlannedStop, SplitChoice } from "@/lib/trips/plan-types"
import { violatingStopKeys } from "@/lib/trips/validate"
import { cn } from "@/lib/utils"

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
 * save is guarded anyway, on both this side and the server's.
 *
 * Vertical lock inline rather than pulling in `@dnd-kit/modifiers` for one
 * three-line function — matching `trip-stop-sortable-list.tsx`.
 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function TripPlanPreview({
  stops,
  items,
  startTime,
  splitChoices,
  onReorder,
  onFlipSplit,
  disabled = false,
}: {
  stops: PlannedStop[]
  items: PlannedItem[]
  /** The trip's `"HH:mm"` departure — every stop's time counts forward from it. */
  startTime: string
  /** Every circular pickup/drop `planTrip` had to resolve by splitting a stop, and what else it could have split. */
  splitChoices: SplitChoice[]
  onReorder: (stops: PlannedStop[]) => void
  /** The dispatcher chose to split `location` instead, for the cycle identified by `key`. */
  onFlipSplit: (key: string, location: string) => void
  disabled?: boolean
}) {
  // The distance threshold is what stops a vertical scroll gesture being
  // swallowed as a drag; dnd-kit only sets `touch-action: none` on the grip.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } })
  )

  const flagged = violatingStopKeys(stops, items)
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
            <SortableStop
              key={stop.stopKey}
              stop={stop}
              position={index + 1}
              isLast={index === stops.length - 1}
              items={items}
              startTime={startTime}
              flagged={flagged.has(stop.stopKey)}
              disabled={disabled}
              onMoveUp={() => move(index, index - 1)}
              onMoveDown={() => move(index, index + 1)}
              flipTarget={flipTargets.get(stop.location)}
              onFlip={onFlipSplit}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

/**
 * One draggable stop: a titled bar saying *where*, and a body saying *what*.
 *
 * The reorder controls sit **along the title bar** rather than in a column down
 * the side. Stacked they were three icon buttons tall — taller than most stops'
 * contents — so every card carried a block of dead space under its body just to
 * make room for them.
 *
 * The arrows are not decoration — they share `move` with the drag handler and
 * are the gloves-on, screen-reader and awkward-device path to the same result.
 */
function SortableStop({
  stop,
  position,
  isLast,
  items,
  startTime,
  flagged,
  disabled,
  onMoveUp,
  onMoveDown,
  flipTarget,
  onFlip,
}: {
  stop: PlannedStop
  position: number
  isLast: boolean
  items: PlannedItem[]
  startTime: string
  flagged: boolean
  disabled: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  /** Present when this stop is one half of a cycle that could be split the other way instead. */
  flipTarget: { key: string; location: string } | undefined
  onFlip: (key: string, location: string) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.stopKey,
    disabled,
  })

  const Icon = stop.kind === "Warehouse" ? WarehouseIcon : MapPinIcon

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        flagged && "border-destructive",
        isDragging && "relative z-10 opacity-80 shadow-lg"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b bg-muted/40 py-1.5 pr-1 pl-1.5",
          flagged && "border-destructive/40 bg-destructive/5"
        )}
      >
        <Button
          ref={setActivatorNodeRef}
          variant="ghost"
          size="icon-sm"
          className="-ml-1 shrink-0 cursor-grab touch-none text-muted-foreground select-none [-webkit-touch-callout:none] active:cursor-grabbing"
          aria-label={`Reorder ${stop.location}`}
          style={{ touchAction: "none" }}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon />
        </Button>

        <StopNumber position={position} tone="primary" />
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        {/* Time stacked under the name rather than beside it: this bar already
            carries a grip, a number, an icon and two arrows, and a location
            long enough to matter is exactly the one that would truncate to
            make room for a clock. As a badge, though, not muted small print —
            the times are what a reorder is being judged against, so they have
            to survive a glance down a column of stops. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
          <p className="truncate text-sm font-medium" title={stop.location}>
            {stop.location}
          </p>
          <StopTimeBadge startTime={startTime} index={position - 1} />
        </div>

        <div className="flex shrink-0 items-center">
          {flipTarget && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={`Split the route at ${flipTarget.location} instead`}
              title={`Split the route at ${flipTarget.location} instead`}
              disabled={disabled}
              onClick={() => onFlip(flipTarget.key, flipTarget.location)}
            >
              <ArrowLeftRightIcon />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`Move ${stop.location} earlier`}
            disabled={disabled || position === 1}
            onClick={onMoveUp}
          >
            <ChevronUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`Move ${stop.location} later`}
            disabled={disabled || isLast}
            onClick={onMoveDown}
          >
            <ChevronDownIcon />
          </Button>
        </div>
      </div>

      <div className="p-2">
        <TripStopItems
          collect={items.filter((item) => item.fromStopKey === stop.stopKey)}
          drop={items.filter((item) => item.toStopKey === stop.stopKey)}
          kind={stop.kind}
        />
      </div>
    </li>
  )
}
