"use client"

import { CheckIcon, PlusIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import type { CandidateTool } from "@/lib/bubble/assigned-tools-types"
import { cn } from "@/lib/utils"

/**
 * One offerable physical tool, shared by the slot dialog and the extras
 * picker so both read identically.
 *
 * A tool already committed elsewhere never reaches here at all — the queries
 * behind this (`listCandidateTools`/`searchTools`) filter on `isFreeToAssign`
 * before this component ever sees a row, so the only thing left to disable is
 * a purely local, same-request concern: already picked for a different slot
 * in this same editing session.
 */
export function ToolRow({
  tool,
  picked,
  usedElsewhere,
  onAdd,
  onRemove,
}: {
  tool: CandidateTool
  picked: boolean
  /** Already on this request, but filling a different slot. */
  usedElsewhere: boolean
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
