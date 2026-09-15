"use client"

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent, Modifier } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TripStopRow } from "@/components/trip-stop-row"
import type { DispatchRequestSummary } from "@/lib/dispatch/summary"
import { cn } from "@/lib/utils"

/**
 * A driver's stops, draggable. The read-only counterpart is
 * `components/trip-stop-list.tsx`; both render the same `TripStopRow`, so edit
 * mode adds handles rather than becoming a different screen.
 *
 * Nothing here writes: reordering only lifts state to `DriverTripCard`, which
 * saves the whole route in one call. That is the point — the user asked for
 * arrange-then-save, not a write per drag.
 *
 * Vertical lock inline instead of pulling in `@dnd-kit/modifiers` for one
 * three-line function.
 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function TripStopSortableList({
  stops,
  onReorder,
  disabled,
}: {
  stops: DispatchRequestSummary[]
  onReorder: (stops: DispatchRequestSummary[]) => void
  /** The save is in flight — freeze the arrangement rather than let it drift under the write. */
  disabled: boolean
}) {
  // The distance threshold is what stops a vertical scroll gesture from being
  // swallowed as a drag; dnd-kit only sets `touch-action: none` on the grip
  // itself (see `setActivatorNodeRef` below), so the card still scrolls.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function move(from: number, to: number) {
    if (to < 0 || to >= stops.length) return
    onReorder(arrayMove(stops, from, to))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    move(
      stops.findIndex((stop) => stop.id === active.id),
      stops.findIndex((stop) => stop.id === over.id)
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={stops.map((stop) => stop.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">
          {stops.map((stop, index) => (
            <SortableTripStop
              key={stop.id}
              stop={stop}
              position={index + 1}
              isLast={index === stops.length - 1}
              disabled={disabled}
              onMoveUp={() => move(index, index - 1)}
              onMoveDown={() => move(index, index + 1)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

/**
 * One draggable stop. The arrows are not decoration — they share `arrayMove`
 * with the drag handler, and they're the gloves-on, screen-reader and
 * awkward-device path to the same result.
 */
function SortableTripStop({
  stop,
  position,
  isLast,
  disabled,
  onMoveUp,
  onMoveDown,
}: {
  stop: DispatchRequestSummary
  position: number
  isLast: boolean
  disabled: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-start gap-1", isDragging && "relative z-10 opacity-80")}
    >
      <div className="flex shrink-0 flex-col items-center gap-0.5 pt-1">
        <Button
          ref={setActivatorNodeRef}
          variant="ghost"
          size="icon-sm"
          className="cursor-grab text-muted-foreground active:cursor-grabbing"
          aria-label={`Reorder ${stop.job}`}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={`Move ${stop.job} earlier`}
          disabled={disabled || position === 1}
          onClick={onMoveUp}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={`Move ${stop.job} later`}
          disabled={disabled || isLast}
          onClick={onMoveDown}
        >
          <ChevronDownIcon />
        </Button>
      </div>
      <div className="min-w-0 flex-1">
        <TripStopRow stop={stop} position={position} isLast={isLast} editing />
      </div>
    </div>
  )
}
