import "server-only"

import { listAssignedTools, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { buildSlots, type AssignedTool } from "@/lib/bubble/assigned-tools-types"
import { listToolTypes } from "@/lib/bubble/reference"
import { listTripFlags } from "@/lib/bubble/triptool-read"
import type { ToolRequest } from "@/lib/bubble/requests"
import { deriveTripStatus, type NotReadyTool, type PickupStop, type TripTool } from "@/lib/dispatch/tool-state"

/**
 * Rolling a request up into the row the Dispatch board and Active trips render.
 *
 * The per-tool classification every one of these rows is built out of lives in
 * `tool-state.ts` — see the note there on why the two are separate files.
 */

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
  notReady: NotReadyTool[]
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
  pickupStops: PickupStop[]
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

  const toolIds = assignedToolRows.map((row) => row.toolId)
  const [toolRows, flagsByRequest] = await Promise.all([listToolsByIds(toolIds), listTripFlags(toolIds)])
  const toolsById = new Map(toolRows.map((tool) => [tool.id, tool]))

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

    const { notReady, pickupStops, tools } = deriveTripStatus(
      request,
      assignedRows,
      toolsById,
      flagsByRequest.get(request.id)
    )

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
