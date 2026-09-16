import { AssignedToolRow } from "@/components/assigned-tool-row"
import type { TripTool } from "@/lib/dispatch/tool-state"

/**
 * A request's tools on the Dispatch board and Active trips cards — the same
 * rows the request detail page shows, at the tighter size those cards can
 * afford. Replaces the flat badge row those screens used to have, which gave
 * a tool already in the van and one still sitting on another job site exactly
 * the same pill.
 */
export function TripToolList({
  requestId,
  tools,
  canPickUp = false,
}: {
  requestId: string
  tools: TripTool[]
  /** The request is `In Transit`, so an off-site tool can be confirmed collected from here. */
  canPickUp?: boolean
}) {
  if (tools.length === 0) return null

  return (
    <ul className="flex w-full min-w-0 flex-col gap-1">
      {tools.map(({ tool, state }) => (
        <AssignedToolRow key={tool.id} requestId={requestId} tool={tool} state={state} compact canPickUp={canPickUp} />
      ))}
    </ul>
  )
}
