"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeftRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  MapPinIcon,
  WarehouseIcon,
  XIcon,
} from "lucide-react"

import { StopTimeBadge } from "@/components/stop-time"
import { TripStopItems } from "@/components/trip-stop-items"
import { StopNumber } from "@/components/stop-number"
import { Button } from "@/components/ui/button"
import { isEmptyPlannedStop, isManualStopKey } from "@/lib/trips/manual-stops"
import type { PlannedItem, PlannedMaterial, PlannedStop } from "@/lib/trips/plan-types"
import { cn } from "@/lib/utils"

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
export function TripPlanStop({
  stop,
  position,
  isLast,
  items,
  materials,
  startTime,
  flagged,
  disabled,
  onMoveUp,
  onMoveDown,
  flipTarget,
  onFlip,
  onRemove,
}: {
  stop: PlannedStop
  position: number
  isLast: boolean
  items: PlannedItem[]
  materials: PlannedMaterial[]
  startTime: string
  flagged: boolean
  disabled: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  /** Present when this stop is one half of a cycle that could be split the other way instead. */
  flipTarget: { key: string; location: string } | undefined
  onFlip: (key: string, location: string) => void
  /** Takes a hand-added stop off the route. Only offered on one. */
  onRemove?: (location: string) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.stopKey,
    disabled,
  })

  const Icon = stop.kind === "Warehouse" ? WarehouseIcon : MapPinIcon
  const manual = isManualStopKey(stop.stopKey)

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
        {/* Time under the name, as a badge: the bar is already crowded, and the
            times are what a reorder is judged against. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
          <p className="truncate text-sm font-medium" title={stop.location}>
            {stop.location}
          </p>
          <StopTimeBadge startTime={startTime} index={position - 1} />
        </div>

        <StopControls
          location={stop.location}
          position={position}
          isLast={isLast}
          disabled={disabled}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          flipTarget={flipTarget}
          onFlip={onFlip}
          onRemove={manual ? onRemove : undefined}
        />
      </div>

      <div className="p-2">
        {manual && isEmptyPlannedStop(stop, items, materials) ? (
          <p className="text-xs text-muted-foreground">Added by hand. Nothing to pick up or drop off here yet.</p>
        ) : (
          <TripStopItems
            collect={items.filter((item) => item.fromStopKey === stop.stopKey)}
            drop={items.filter((item) => item.toStopKey === stop.stopKey)}
            collectMaterials={materials.filter((material) => material.fromStopKey === stop.stopKey)}
            dropMaterials={materials.filter((material) => material.toStopKey === stop.stopKey)}
            kind={stop.kind}
          />
        )}
      </div>
    </li>
  )
}

/** The title bar's buttons: split the other way, move earlier or later, and remove a hand-added stop. */
function StopControls({
  location,
  position,
  isLast,
  disabled,
  onMoveUp,
  onMoveDown,
  flipTarget,
  onFlip,
  onRemove,
}: {
  location: string
  position: number
  isLast: boolean
  disabled: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  flipTarget: { key: string; location: string } | undefined
  onFlip: (key: string, location: string) => void
  onRemove?: (location: string) => void
}) {
  return (
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
        aria-label={`Move ${location} earlier`}
        disabled={disabled || position === 1}
        onClick={onMoveUp}
      >
        <ChevronUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        aria-label={`Move ${location} later`}
        disabled={disabled || isLast}
        onClick={onMoveDown}
      >
        <ChevronDownIcon />
      </Button>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Remove the stop at ${location}`}
          title="Remove this stop"
          disabled={disabled}
          onClick={() => onRemove(location)}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}
