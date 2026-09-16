"use client"

import { CheckIcon, PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import type { CandidateTool, ToolRequestClaim } from "@/lib/bubble/assigned-tools-types"
import { cn } from "@/lib/utils"

/**
 * "Already on <job>", with the direction spelled out — a pickup bringing the
 * tool home and a delivery taking it out are both double bookings, but only one
 * of them means the tool is about to be somewhere else entirely.
 */
function claimTitle(claim: ToolRequestClaim): string {
  return `${claim.pickup ? "Being collected for" : "Already going out on"} ${claim.job}`
}

/**
 * One offerable physical tool, shared by the slot dialog and the extras
 * picker so both read identically.
 *
 * A tool whose **status** says it is committed never reaches here at all — the
 * queries behind this (`listCandidateTools`/`searchTools`) filter on
 * `isFreeToAssign` before this component ever sees a row, so the only
 * *candidate* left to disable is a purely local, same-request concern: already
 * picked for a different slot in this same editing session. A tool held by
 * another request is a separate matter and does reach here; see `heldBy`.
 *
 * `locked` is the other direction, and arrives only via the already-assigned
 * tools the assign screen merges in by id: this request's own tool, already out
 * on a trip. It stays listed — it is part of the load — but it has no remove
 * control, because `assignToolsAction` would refuse the save anyway.
 *
 * `heldBy` is neither. It is a tool another **open request** already holds,
 * which stays perfectly addable — see `ToolRequestClaim` — so the row keeps its
 * Add button and says so instead. The line replaces the location rather than
 * sitting under it because the two compete for the same truncating row, and a
 * double booking is the more urgent of the two things to read.
 */
export function ToolRow({
  tool,
  picked,
  usedElsewhere,
  locked = false,
  heldBy,
  onAdd,
  onRemove,
}: {
  tool: CandidateTool
  picked: boolean
  /** Already on this request, but filling a different slot. */
  usedElsewhere: boolean
  /** Already on a truck, landed, or claimed by a saved trip — see `isLockedToTrip` and `ToolTripClaim`. Can't be unpicked here. */
  locked?: boolean
  /** A different open request already holds this tool. A warning, not a block — see `ToolRequestClaim`. */
  heldBy?: ToolRequestClaim
  onAdd: () => void
  onRemove: () => void
}) {
  const blocked = usedElsewhere && !picked

  return (
    <Item
      size="sm"
      variant={picked ? "muted" : "default"}
      className={cn("flex-nowrap", picked && "ring-1 ring-primary/40", blocked && "opacity-60")}
    >
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate" title={tool.name}>
          {tool.name}
        </ItemTitle>
        <ItemDescription className="truncate">
          {blocked ? (
            "Already filling another slot on this request"
          ) : heldBy ? (
            <span className="flex items-center gap-1 text-status-attention-foreground">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              <span className="truncate" title={claimTitle(heldBy)}>
                {claimTitle(heldBy)}
              </span>
            </span>
          ) : (
            <>
              {tool.location}
              {tool.floor && ` · Floor ${tool.floor}`}
            </>
          )}
        </ItemDescription>
      </ItemContent>

      <ItemActions className="shrink-0">
        {/* `status` is `tools.statusNew`, backfilled on every row — a blank one
            is a row the migration missed, and an empty pill would read as a
            style bug rather than as missing data. */}
        {tool.status && (
          <Badge variant="outline" className="hidden sm:inline-flex">
            {tool.status}
          </Badge>
        )}
        {picked ? (
          /* State and action, split: an inert "Added" chip says where the tool
             stands, and the X beside it is the only thing that removes it. One
             button doing both left the click's outcome unguessable. */
          <>
            <Badge className="border-transparent bg-status-ok/15 text-status-ok-foreground">
              <CheckIcon />
              Added
            </Badge>
            {!locked && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRemove}
                title={`Remove ${tool.name}`}
                aria-label={`Remove ${tool.name}`}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <XIcon />
              </Button>
            )}
          </>
        ) : (
          <Button variant="outline" size="sm" disabled={blocked} onClick={onAdd}>
            <PlusIcon />
            Add
          </Button>
        )}
      </ItemActions>
    </Item>
  )
}
