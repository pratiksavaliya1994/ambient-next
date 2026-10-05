"use client"

import { LockIcon, XIcon } from "lucide-react"

import { AssignSlotDialog } from "@/components/assign-slot-dialog"
import { SetGapNotice } from "@/components/tool-set-group"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  assignedLabel,
  type AssignSlot,
  type CandidateTool,
  type ToolRequestClaim,
  warehouseSpotOf,
} from "@/lib/bubble/assigned-tools-types"
import { setShortfall, type SetShape } from "@/lib/bubble/tool-sets"
import { cn } from "@/lib/utils"

/**
 * One requested tool type: how many were asked for, which physical tools fill
 * it so far, and a dialog to add more from that type's candidates.
 *
 * The requested quantity bounds the slot in neither direction. Short is a
 * supported outcome, not an error, so an unfilled slot renders as the app's
 * existing dashed `Empty` idiom rather than as a validation failure — and long
 * is equally fine, since what a job needs is the loader's call, not a number
 * typed on the request. The count reads `N assigned · M requested` for exactly
 * that reason.
 *
 * Short is also **recoverable later**: this card is reachable while the request
 * is out on the road, so a slot can be filled in after the rest of the load has
 * already gone. The tools that went are in `lockedIds` and lose their remove
 * control; everything else here works unchanged.
 *
 * Picks that don't make whole **tool sets** (see `lib/bubble/tool-sets.ts`) get
 * a `SetGapNotice` under the list — the same "short is allowed, but say so"
 * stance, one level down.
 */
export function AssignSlotCard({
  slot,
  chosen,
  candidates,
  setShape,
  usedElsewhere,
  lockedIds,
  heldElsewhere,
  onAdd,
  onRemove,
}: {
  slot: AssignSlot
  chosen: CandidateTool[]
  candidates: CandidateTool[]
  /** This type's tool sets, if it has any — `NO_SETS` for an ordinary type. */
  setShape: SetShape
  usedElsewhere: Set<string>
  /**
   * Tools already on a truck or landed, plus the ones a saved trip is on its way
   * to collect — listed, but not removable. See `isLockedToTrip` and
   * `ToolTripClaim`; the panel is what unions the two.
   */
  lockedIds: Set<string>
  /** Tools a *different* open request already holds — a warning on the row, not a block. */
  heldElsewhere: Map<string, ToolRequestClaim>
  onAdd: (tools: CandidateTool[]) => void
  onRemove: (toolIds: string[]) => void
}) {
  /** Enough on the truck to cover what was asked for. Not a cap — more is allowed. */
  const met = chosen.length >= slot.requested

  return (
    <div className="flex flex-col gap-2 border-b bg-muted/40 p-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold" title={slot.toolType}>
            {slot.toolType}
          </span>
          {slot.consumable ? (
            <Badge variant="outline">Consumable</Badge>
          ) : (
            <Badge
              className={cn(
                "tabular-nums",
                met
                  ? "border-transparent bg-status-ok/15 text-status-ok-foreground"
                  : "border-transparent bg-background text-muted-foreground"
              )}
            >
              {assignedLabel(chosen.length, slot.requested)}
            </Badge>
          )}
        </div>

        {!slot.consumable && (
          <AssignSlotDialog
            slot={slot}
            chosen={chosen}
            candidates={candidates}
            setShape={setShape}
            usedElsewhere={usedElsewhere}
            lockedIds={lockedIds}
            heldElsewhere={heldElsewhere}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        )}
      </div>

      {slot.consumable ? (
        <p className="text-sm text-muted-foreground">Consumable — nothing to assign.</p>
      ) : chosen.length === 0 ? (
        <Empty className="border border-dashed py-6">
          <EmptyHeader>
            <EmptyTitle className="text-sm">Nothing assigned</EmptyTitle>
            <EmptyDescription>A slot can go out empty — leave it if there is nothing to send.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ChosenTools chosen={chosen} lockedIds={lockedIds} onRemove={onRemove} />
          <SetGapNotice shortfall={setShortfall(chosen, candidates, setShape)} />
        </>
      )}
    </div>
  )
}

function ChosenTools({
  chosen,
  lockedIds,
  onRemove,
}: {
  chosen: CandidateTool[]
  lockedIds: Set<string>
  onRemove: (toolIds: string[]) => void
}) {
  return (
    <ul className="flex flex-col gap-1.5 border-l-2 border-muted-foreground/25 pl-3">
      {chosen.map((tool) => {
        const locked = lockedIds.has(tool.id)
        const spot = warehouseSpotOf(tool)

        return (
          <li key={tool.id} className="flex items-center gap-3 rounded-md border bg-background px-2.5 py-1.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm" title={tool.name}>
                {tool.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {tool.location}
                {tool.floor && ` · Floor ${tool.floor}`}
                {spot && ` · ${spot}`}
                {` · ${tool.status}`}
              </span>
            </div>
            {/* Gone, or spoken for by a trip. The badge replaces the X
                rather than sitting beside a disabled one: either way this
                tool does not come back off the request from here — the
                notice at the top of the panel says which case it is. */}
            {locked ? (
              <Badge variant="outline" className="shrink-0">
                <LockIcon />
                On a trip
              </Badge>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemove([tool.id])}
                aria-label={`Remove ${tool.name}`}
              >
                <XIcon />
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
