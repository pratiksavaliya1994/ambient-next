import "server-only"

import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { buildSlots, type AssignedTool } from "@/lib/bubble/assigned-tools-types"
import { isReadyForDispatch } from "@/lib/bubble/enums"
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
  /**
   * Assigned tools whose live `statusNew` isn't `Available` right now — still
   * mid-flow on a different, not-yet-offloaded request. `location` is
   * whatever dispatch/offload last wrote there — the driver's name while
   * `In Transit`, the other job's name once `Delivered` — so the message can
   * say where the tool actually is, not just what state it's in. Non-empty
   * means this request can't dispatch yet, whatever the dates said when it
   * was assigned.
   */
  notReady: { name: string; status: string; location: string }[]
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
 * read back by id and grouped by their own `name` instead. The same read-back
 * also carries each tool's live `statusNew`, which is what `notReady` is built
 * from — a tool can be validly `assignedtools`-linked here while still
 * mid-flow on a different, not-yet-offloaded request (see `isReadyForDispatch`).
 */
export async function toDispatchSummaries(requests: ToolRequest[]): Promise<DispatchRequestSummary[]> {
  const [assignedToolRows, toolTypes] = await Promise.all([
    listAssignedTools(requests.map((request) => request.id)),
    listToolTypes(),
  ])

  const toolsById = new Map(
    (await listToolsByIds(assignedToolRows.map((row) => row.toolId))).map((tool) => [tool.id, tool])
  )
  const toolsByRequest = new Map<string, Map<string, number>>()
  const assignedByRequest = new Map<string, AssignedTool[]>()
  const notReadyByRequest = new Map<string, { name: string; status: string; location: string }[]>()
  for (const row of assignedToolRows) {
    const tool = toolsById.get(row.toolId)
    const label = tool?.name ?? (row.toolType || "Unlabeled tool")

    const byName = toolsByRequest.get(row.requestId) ?? new Map<string, number>()
    byName.set(label, (byName.get(label) ?? 0) + 1)
    toolsByRequest.set(row.requestId, byName)

    const rows = assignedByRequest.get(row.requestId) ?? []
    rows.push(row)
    assignedByRequest.set(row.requestId, rows)

    if (tool && !isReadyForDispatch(tool.status)) {
      const notReady = notReadyByRequest.get(row.requestId) ?? []
      notReady.push({ name: tool.name, status: tool.status, location: tool.location })
      notReadyByRequest.set(row.requestId, notReady)
    }
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
      notReady: notReadyByRequest.get(request.id) ?? [],
    }
  })
}
