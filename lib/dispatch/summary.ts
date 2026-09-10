import "server-only"

import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { buildSlots, type AssignedTool } from "@/lib/bubble/assigned-tools-types"
import { listToolTypes } from "@/lib/bubble/reference"
import type { ToolRequest } from "@/lib/bubble/requests"

/** What the Dispatch board and the Active trips screen both need from a `ToolRequest`. */
export type DispatchRequestSummary = {
  id: string
  job: string
  start: string | null
  end: string | null
  timeRange: string | null
  fieldPm: string | null
  driver: string | null
  /** Physical tools on `assignedtools` for this request — not the requested quantity. */
  toolCount: number
  /** Same tools, broken out by each physical `tools.name` so a driver can size up a trip. */
  tools: { name: string; count: number }[]
  /**
   * Requested tool types this request still hasn't filled to the requested
   * quantity — consumables excluded, same as the assign screen, since those
   * never get a physical unit assigned. Empty means fully assigned.
   */
  missing: { toolType: string; short: number }[]
}

/**
 * Attaches each request's physical `assignedtools`, grouped by the tool's own
 * `name` rather than the requested type — the shape both `/dispatch` and
 * `/dispatch/active` render. One `in` query for every request passed in, so a
 * caller with several lists to summarise should concatenate them first rather
 * than calling this once per list.
 *
 * `toolType` on an `assignedtools` row is just the requested *type* name
 * (e.g. "Pump Jack Electric") — every unit of a type shows up identical. A
 * driver sizing up a trip needs the actual physical `tools` rows, so those are
 * read back by id and grouped by their own `name` instead.
 */
export async function toDispatchSummaries(requests: ToolRequest[]): Promise<DispatchRequestSummary[]> {
  const [assignedToolRows, toolTypes] = await Promise.all([
    listAssignedTools(requests.map((request) => request.id)),
    listToolTypes(),
  ])

  const toolNameById = new Map(
    (await listToolsByIds(assignedToolRows.map((row) => row.toolId))).map((tool) => [tool.id, tool.name])
  )
  const toolsByRequest = new Map<string, Map<string, number>>()
  const assignedByRequest = new Map<string, AssignedTool[]>()
  for (const row of assignedToolRows) {
    const byName = toolsByRequest.get(row.requestId) ?? new Map<string, number>()
    const label = toolNameById.get(row.toolId) ?? (row.toolType || "Unlabeled tool")
    byName.set(label, (byName.get(label) ?? 0) + 1)
    toolsByRequest.set(row.requestId, byName)

    const rows = assignedByRequest.get(row.requestId) ?? []
    rows.push(row)
    assignedByRequest.set(row.requestId, rows)
  }

  return requests.map((request) => {
    const tools = [...(toolsByRequest.get(request.id) ?? new Map<string, number>())]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const { slots } = buildSlots(request.tools, assignedByRequest.get(request.id) ?? [], toolTypes)
    const missing = slots
      .filter((slot) => !slot.consumable && slot.toolIds.length < slot.requested)
      .map((slot) => ({ toolType: slot.toolType, short: slot.requested - slot.toolIds.length }))

    return {
      id: request.id,
      job: request.job,
      start: request.start,
      end: request.end,
      timeRange: request.timeRange,
      fieldPm: request.fieldPm,
      driver: request.driver,
      toolCount: tools.reduce((sum, tool) => sum + tool.count, 0),
      tools,
      missing,
    }
  })
}
