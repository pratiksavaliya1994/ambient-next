import "server-only"

import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { buildSlots, type AssignedTool, type CandidateTool } from "@/lib/bubble/assigned-tools-types"
import {
  isReadyForDispatch,
  isWarehouseLocation,
  TOOL_STATUS_IN_TRANSIT,
  TOOL_STATUS_PICKUP_REQUESTED,
} from "@/lib/bubble/enums"
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
  /**
   * `request.order` — this stop's position on its driver's trip, offset above
   * `STOP_ORDER_BASE`. `100` means never sequenced. `compareStops`
   * (`lib/dispatch/stop-order.ts`) is what reads it.
   */
  order: number
  /** Physical tools on `assignedtools` for this request — not the requested quantity. */
  toolCount: number
  /**
   * The same tools one row apiece, each tagged with where it actually is on
   * this trip — so a driver reads "already loaded" and "still to collect" off
   * the list itself rather than off a second list beside it. Outstanding ones
   * sort first; see `deriveTripStatus`.
   */
  tools: TripTool[]
  /**
   * Requested tool types this request still hasn't filled to the requested
   * quantity — consumables excluded, same as the assign screen, since those
   * never get a physical unit assigned. Empty means fully assigned.
   */
  missing: { toolType: string; short: number }[]
  /**
   * Assigned tools that fail `isReadyForDispatch` — genuinely mid-flow on a
   * different, not-yet-offloaded request (`In Transit`, `Delivered`,
   * `Pickup Requested` elsewhere), not merely this request's own `Assigned`.
   * `location` is whatever dispatch/offload last wrote there — the driver's
   * name while `In Transit`, the other job's name once `Delivered` — so the
   * message can say where the tool actually is, not just what state it's in.
   * Non-empty means this request can't dispatch yet.
   */
  notReady: { name: string; status: string; location: string }[]
  /**
   * Off-site tools this request's assignment still needs collected before its
   * own delivery, grouped by job-site location — every pickup here happens
   * before this request's own delivery. `toolIds` is what a "mark picked up"
   * action (`confirmPickupAction`) sends back for that stop.
   *
   * Dispatch (`dispatchAction`) only moves a warehouse-origin tool straight to
   * `In Transit`; an off-site one is deliberately left alone (`Assigned`,
   * wherever Assign put it — see `lib/bubble/enums.ts`'s `TOOL_STATUS_NEW` doc),
   * so this is derived from each tool's plain live `statusNew`/`location` —
   * true both before dispatch (Dispatch board preview) and after (Active
   * trips and the request detail page, until the driver confirms).
   * Empty means every assigned tool is already at/near the warehouse or
   * already carried by this trip.
   */
  pickupStops: { location: string; toolIds: string[]; tools: { name: string; count: number }[] }[]
}

/**
 * One driver's whole `In Transit` load — the unit `/dispatch/active` renders a
 * card per, and the unit a stop sequence is saved against.
 *
 * `driver` stays `null` for the no-driver bucket rather than being folded into
 * an "Unknown driver" string: that bucket can't be sequenced (the write action
 * re-reads the trip with an `equals` constraint, which is not a reliable
 * is-empty query), and the card needs to know that structurally.
 */
export type DriverTrip = { driver: string | null; stops: DispatchRequestSummary[] }

type PickupStopAccumulator = { toolIds: Set<string>; byToolName: Map<string, number> }

/**
 * Where one assigned tool stands relative to its request's own trip:
 * `carried` — already with this trip's driver; `pending-pickup` — off-site and
 * still needing collecting before this delivery; `left-behind` — the driver
 * reached its site and couldn't take it, so this trip goes without it;
 * `not-ready` — mid-flow on some other request, blocking. `null` is the
 * ordinary case: ready (`Available` or this request's own `Assigned`) and at
 * the warehouse, nothing to say about it.
 */
export type ToolTripState = "carried" | "pending-pickup" | "left-behind" | "not-ready"

/** One physical tool plus that verdict — what every tool row on screen renders from. */
export type TripTool = { tool: CandidateTool; state: ToolTripState | null }

/** Outstanding work first, already-loaded last; alphabetical within each band. */
const STATE_ORDER: Record<string, number> = {
  "pending-pickup": 0,
  "not-ready": 1,
  "left-behind": 2,
  null: 3,
  carried: 4,
}

/**
 * One request's assigned tools, classified into where they actually stand —
 * once as a flat per-tool list (`tools`), once rolled up the two ways the
 * screens need (`notReady` for the dispatch gate's message, `pickupStops` for
 * the delivery guard's count), and once keyed by id for a screen that renders
 * tools grouped by requested type rather than in one list (`byToolId`). All
 * four are the same single pass.
 *
 * Shared by `toDispatchSummaries` (Dispatch board / Active trips) and the
 * request detail page (`app/(app)/requests/[requestId]/page.tsx`), so the
 * same tool reads the same way everywhere instead of two derivations
 * drifting apart.
 */
export type TripToolStatus = {
  notReady: DispatchRequestSummary["notReady"]
  pickupStops: DispatchRequestSummary["pickupStops"]
  /**
   * Tool ids the driver reached but couldn't collect. `offloadAction` subtracts
   * these from what it writes `Delivered` — a tool that never got on the truck
   * can't truthfully land at the job — and the detail page counts them for the
   * Complete delivery dialog.
   */
  leftBehind: string[]
  tools: TripTool[]
  byToolId: Map<string, ToolTripState>
}

export function deriveTripStatus(
  request: Pick<ToolRequest, "status" | "driver">,
  assignedRows: readonly AssignedTool[],
  toolsById: Map<string, CandidateTool>
): TripToolStatus {
  const notReady: DispatchRequestSummary["notReady"] = []
  const leftBehind: string[] = []
  const byLocation = new Map<string, PickupStopAccumulator>()
  const byToolId = new Map<string, ToolTripState>()
  const tools: TripTool[] = []

  for (const row of assignedRows) {
    // An `assignedtools` row pointing at a deleted `tools` row — nothing to
    // name or classify, so it only survives in `toolCount`.
    const tool = toolsById.get(row.toolId)
    if (!tool) continue

    const state = classifyTool(request, tool)
    tools.push({ tool, state })
    if (state) byToolId.set(tool.id, state)

    if (state === "not-ready") {
      notReady.push({ name: tool.name, status: tool.status, location: tool.location })
    } else if (state === "left-behind") {
      leftBehind.push(tool.id)
    } else if (state === "pending-pickup") {
      const stop = byLocation.get(tool.location) ?? { toolIds: new Set<string>(), byToolName: new Map<string, number>() }
      stop.toolIds.add(tool.id)
      stop.byToolName.set(tool.name, (stop.byToolName.get(tool.name) ?? 0) + 1)
      byLocation.set(tool.location, stop)
    }
  }

  tools.sort(
    (a, b) => STATE_ORDER[String(a.state)] - STATE_ORDER[String(b.state)] || a.tool.name.localeCompare(b.tool.name)
  )

  const pickupStops = [...byLocation]
    .map(([location, stop]) => ({
      location,
      toolIds: [...stop.toolIds],
      tools: [...stop.byToolName]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.location.localeCompare(b.location))

  return { notReady, pickupStops, leftBehind, tools, byToolId }
}

function classifyTool(request: Pick<ToolRequest, "status" | "driver">, tool: CandidateTool): ToolTripState | null {
  // What `leaveBehindAction` writes and nothing else in the app does: flagged
  // still-wanted, while `location` stays the job site it was never collected
  // from.
  const flagged = tool.status === TOOL_STATUS_PICKUP_REQUESTED && !isWarehouseLocation(tool.location)

  // The trip is over. Nothing is left to do with any tool, so every other state
  // collapses to plain — but the ones that never made it still have to say so,
  // which is the only reason a delivered request gets classified at all.
  if (request.status === "Delivered") return flagged ? "left-behind" : null

  // Already with this trip's own driver — either a warehouse tool dispatch
  // moved directly, or an off-site one a "mark picked up" confirm already
  // moved. Neither a conflict nor a pending stop.
  if (
    request.status === "In Transit" &&
    tool.status === TOOL_STATUS_IN_TRANSIT &&
    request.driver != null &&
    tool.location === request.driver
  ) {
    return "carried"
  }

  // Tested before `not-ready` because `Pickup Requested` fails
  // `isReadyForDispatch` too and would otherwise swallow it. Gated on
  // `In Transit` deliberately: before this request is dispatched the same two
  // fields mean "some pickup request already wants this tool" — a genuine
  // blocker the Dispatch board must keep reporting as `not-ready`, not a
  // decision this trip made.
  if (request.status === "In Transit" && flagged) return "left-behind"

  if (!isReadyForDispatch(tool.status)) return "not-ready"
  if (!isWarehouseLocation(tool.location)) return "pending-pickup"
  return null
}

/**
 * Attaches each request's physical `assignedtools`, one row per unit — the
 * shape both `/dispatch` and `/dispatch/active` render. One `in` query for
 * every request passed in, so a caller with several lists to summarise should
 * concatenate them first rather than calling this once per list.
 *
 * `toolType` on an `assignedtools` row is just the requested *type* name
 * (e.g. "Pump Jack Electric") — every unit of a type shows up identical. A
 * driver sizing up a trip needs the actual physical `tools` rows, so those are
 * read back by id and passed through `deriveTripStatus` instead. The same
 * read-back carries each tool's live `statusNew`/`location`, which is what
 * gives every row its state.
 */
export async function toDispatchSummaries(requests: ToolRequest[]): Promise<DispatchRequestSummary[]> {
  const [assignedToolRows, toolTypes] = await Promise.all([
    listAssignedTools(requests.map((request) => request.id)),
    listToolTypes(),
  ])

  const toolsById = new Map(
    (await listToolsByIds(assignedToolRows.map((row) => row.toolId))).map((tool) => [tool.id, tool])
  )

  const assignedByRequest = new Map<string, AssignedTool[]>()
  for (const row of assignedToolRows) {
    const rows = assignedByRequest.get(row.requestId) ?? []
    rows.push(row)
    assignedByRequest.set(row.requestId, rows)
  }

  return requests.map((request) => {
    const assignedRows = assignedByRequest.get(request.id) ?? []

    const { slots } = buildSlots(request.tools, assignedRows, toolTypes)
    const missing = slots
      .filter((slot) => !slot.consumable && slot.toolIds.length < slot.requested)
      .map((slot) => ({ toolType: slot.toolType, short: slot.requested - slot.toolIds.length }))

    const { notReady, pickupStops, tools } = deriveTripStatus(request, assignedRows, toolsById)

    return {
      id: request.id,
      job: request.job,
      start: request.start,
      end: request.end,
      timeRange: request.timeRange,
      fieldPm: request.fieldPm,
      driver: request.driver,
      order: request.order,
      toolCount: assignedRows.length,
      tools,
      missing,
      notReady,
      pickupStops,
    }
  })
}
