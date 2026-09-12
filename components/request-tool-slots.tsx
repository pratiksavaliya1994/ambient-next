import { AssignedToolRow } from "@/components/assigned-tool-row"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { assignedLabel, type AssignSlot, type CandidateTool } from "@/lib/bubble/assigned-tools-types"
import type { ToolTripState } from "@/lib/dispatch/summary"
import { cn } from "@/lib/utils"

/**
 * The request detail page's requested-tools list: one group per requested tool
 * type, the physical units assigned to it nested under it. `toolStates` is
 * `deriveTripStatus`'s per-tool classification — populated once a request is
 * `Assigned`, and what gives each row its colour. `canPickUp` is the narrower
 * question of whether that colour comes with an action, which it only does
 * once the request is actually out on the road.
 */
export function RequestToolSlots({
  requestId,
  slots,
  toolsById,
  toolStates,
  canPickUp,
}: {
  requestId: string
  slots: AssignSlot[]
  toolsById: Map<string, CandidateTool>
  toolStates: Map<string, ToolTripState> | null
  canPickUp: boolean
}) {
  if (slots.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No tools requested</EmptyTitle>
          <EmptyDescription>This request has no tool line — there is nothing to assign against.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-lg border">
      {slots.map((slot) => {
        const tools = slot.toolIds
          .map((id) => toolsById.get(id))
          .filter((tool): tool is CandidateTool => Boolean(tool))

        return (
          <li key={slot.toolType} className="flex flex-col gap-2 bg-muted/40 px-3 py-2">
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 flex-1 text-sm font-semibold wrap-anywhere">{slot.toolType}</span>
              {slot.consumable ? (
                <Badge variant="outline">Consumable</Badge>
              ) : (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
                    slot.toolIds.length >= slot.requested
                      ? "bg-status-ok/15 text-status-ok-foreground"
                      : "bg-status-attention/15 text-status-attention-foreground"
                  )}
                >
                  {assignedLabel(slot.toolIds.length, slot.requested)}
                </span>
              )}
            </div>

            {tools.length > 0 ? (
              <ul className="flex flex-col gap-1.5 border-l-2 border-muted-foreground/25 pl-3">
                {tools.map((tool) => (
                  <AssignedToolRow
                    key={tool.id}
                    requestId={requestId}
                    tool={tool}
                    state={toolStates?.get(tool.id) ?? null}
                    canPickUp={canPickUp}
                  />
                ))}
              </ul>
            ) : (
              !slot.consumable && (
                <p className="border-l-2 border-status-attention/50 pl-3 text-xs font-medium text-status-attention-foreground">
                  No tool assigned yet for this type
                </p>
              )
            )}
          </li>
        )
      })}
    </ul>
  )
}
