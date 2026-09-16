import { type AssignedTool, type CandidateTool } from "@/lib/bubble/assigned-tools-types"
import { isOpenRequest, isPickupRequest, isWarehouseLocation } from "@/lib/bubble/enums"
import { isReadyForDispatch, TOOL_STATUS_IN_TRANSIT, TOOL_STATUS_PICKUP_REQUESTED } from "@/lib/bubble/tool-enums"
import type { ToolRequest } from "@/lib/bubble/requests"
import { hasLanded } from "@/lib/trips/request-progress"
import type { TripFlag } from "@/lib/trips/plan-types"

/**
 * Where each of a request's assigned tools actually stands — the per-tool half
 * of what used to be all of `summary.ts`.
 *
 * Split out when the skip fix pushed that file past the 300-line cap, along the
 * seam that was already there: **this** module answers "what is true of one
 * tool", `summary.ts` rolls a whole request up into a board row. The dependency
 * runs one way — `summary.ts` imports from here — which is why `notReady` and
 * `pickupStops` are named types here rather than being reached for through
 * `DispatchRequestSummary[...]` as they were.
 */

/** An assigned tool genuinely mid-flow on someone else's request. Blocks dispatch. */
export type NotReadyTool = { name: string; status: string; location: string }

/** One job site this request's assignment still needs collecting from, before its own delivery. */
export type PickupStop = { location: string; toolIds: string[]; tools: { name: string; count: number }[] }

/**
 * Where one assigned tool stands relative to its request's own trip:
 * `carried` — already with this trip's driver; `pending-pickup` — off-site and
 * still needing collecting before this delivery; `left-behind` — a driver
 * reached it and couldn't take it, so that trip went without it; `refused` —
 * the driver got it to the site and the site turned it away, so it is on its
 * way back to the yard or already there; `not-ready` — mid-flow on some other
 * request, blocking; `delivered` / `returned` — already where this request was
 * sending it, so its own leg is over even while the request is still open.
 * `null` is the ordinary case: ready (`Available` or this request's own
 * `Assigned`) and at the warehouse, nothing to say about it.
 *
 * The two landed values are one concept (`hasLanded`) split by direction, so a
 * row can say "Delivered" or "Returned" without re-deriving which branch the
 * request is on.
 *
 * `left-behind` and `refused` are the two ways a trip can fail a tool, and they
 * are kept apart because the next move differs: a left-behind tool is still
 * standing at the address it was always at, so the fix is another collect; a
 * refused one is back in the yard with its delivery still owed, so the fix is
 * another delivery — to a site that has already said no once.
 */
export type ToolTripState =
  | "carried"
  | "pending-pickup"
  | "left-behind"
  | "refused"
  | "not-ready"
  | "delivered"
  | "returned"

/** One physical tool plus that verdict — what every tool row on screen renders from. */
export type TripTool = { tool: CandidateTool; state: ToolTripState | null }

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
  notReady: NotReadyTool[]
  pickupStops: PickupStop[]
  /**
   * Tool ids this request cannot truthfully deliver: the ones a driver couldn't
   * collect (`left-behind`) and the ones a site turned away (`refused`).
   * `offloadAction` subtracts these from what it writes `Delivered`, and the
   * detail page counts them for the Complete delivery dialog.
   *
   * Both belong here even though they sit at opposite ends of the trip. A
   * left-behind tool never reached the driver; a refused one reached the site
   * and came home. Writing either of them `Delivered` at the job records a drop
   * that did not happen — and a refused tool would then read as standing on the
   * very site that rejected it, while physically in the yard.
   */
  undeliverable: string[]
  tools: TripTool[]
  byToolId: Map<string, ToolTripState>
}

type PickupStopAccumulator = { toolIds: Set<string>; byToolName: Map<string, number> }

/** Outstanding work first, already-loaded last; alphabetical within each band. */
const STATE_ORDER: Record<string, number> = {
  "pending-pickup": 0,
  "not-ready": 1,
  // The two failures share a band: both need the same decision from a PM, and
  // neither is more urgent than the other. Ties fall to the name sort below.
  "left-behind": 2,
  refused: 2,
  null: 3,
  carried: 4,
  delivered: 5,
  returned: 5,
}

export function deriveTripStatus(
  // `job`/`delivery`/`pickup` are what `hasLanded` needs to tell a tool that
  // reached *this* request's destination from one held by another request.
  request: Pick<ToolRequest, "status" | "driver" | "job" | "delivery" | "pickup">,
  assignedRows: readonly AssignedTool[],
  toolsById: Map<string, CandidateTool>,
  /**
   * What the last trip decided about each of this request's tools, from
   * `listTripFlags` — the `triptool` rows, not an inference off `statusNew`.
   * Empty is the ordinary case and the safe default: nothing reads as failed.
   */
  tripFlags: ReadonlyMap<string, TripFlag> = new Map()
): TripToolStatus {
  const notReady: NotReadyTool[] = []
  const undeliverable: string[] = []
  const byLocation = new Map<string, PickupStopAccumulator>()
  const byToolId = new Map<string, ToolTripState>()
  const tools: TripTool[] = []

  for (const row of assignedRows) {
    // An `assignedtools` row pointing at a deleted `tools` row — nothing to
    // name or classify, so it only survives in `toolCount`.
    const tool = toolsById.get(row.toolId)
    if (!tool) continue

    const state = classifyTool(request, tool, tripFlags.get(tool.id) ?? null)
    tools.push({ tool, state })
    if (state) byToolId.set(tool.id, state)

    if (state === "not-ready") {
      notReady.push({ name: tool.name, status: tool.status, location: tool.location })
    } else if (state === "left-behind" || state === "refused") {
      undeliverable.push(tool.id)
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

  return { notReady, pickupStops, undeliverable, tools, byToolId }
}

function classifyTool(
  request: Pick<ToolRequest, "status" | "driver" | "job" | "delivery" | "pickup">,
  tool: CandidateTool,
  /** What the last trip made of this tool, or `null`. Ground truth — see `listTripFlags`. */
  flag: TripFlag | null
): ToolTripState | null {
  // The **pre-phase-4** signal for the same thing: `leaveBehindAction` wrote
  // `Pickup Requested` and left `location` on the job site, and nothing else.
  // Kept because a request dispatched before phase 4 has no `triptool` rows to
  // consult at all — but no longer the only signal, because on its own it
  // misses every skip at a *warehouse* stop (`location` stays `"Warehouse"`,
  // so this never matches) and cannot tell a skip from a pickup request
  // wanting the tool, which is why it carries a status gate below and `flag`
  // does not.
  const flagged = tool.status === TOOL_STATUS_PICKUP_REQUESTED && !isWarehouseLocation(tool.location)

  // Already where this request was sending it: this tool's leg is finished,
  // whatever the request as a whole still has outstanding. Tested first, and
  // through the same `hasLanded` that `requestProgress` and the trip builder's
  // movement pool use, so a tool those two count as landed can never also read
  // as a conflict here.
  //
  // Without this, a tool dropped on an earlier trip — `Delivered`, sitting at
  // this request's own job — failed `isReadyForDispatch` and fell through to
  // `not-ready`, which then named this request's own job as the "other
  // request" holding it. Only a request closed in one go escaped that, via the
  // terminal branch below; a `Partially Delivered` one showed the tools it had
  // already delivered in red.
  if (hasLanded(request, tool)) return isPickupRequest(request) ? "returned" : "delivered"

  // The trip is over. Nothing is left to do with any tool, so every other state
  // collapses to plain — but the ones that never made it still have to say so,
  // which is the only reason a closed request gets classified at all. Both
  // terminals count: a `Returned` pickup is as finished as a `Delivered`
  // delivery.
  if (!isOpenRequest(request.status)) {
    if (flag === "refused") return "refused"
    return flag === "skipped" || flagged ? "left-behind" : null
  }

  // **Tested before `carried`**, and that is the whole reason this branch sits
  // here rather than beside the skip below. A refused tool is genuinely
  // `In Transit` with the driver until the return stop, so `carried` matches it
  // and would report "On the truck" — true, and exactly the wrong thing to say
  // about a tool heading home from a delivery that failed. Once it is unloaded
  // it stops matching `carried` and starts reading as an ordinary `Available`
  // tool in the yard, which is worse still: nothing on the page would then
  // record that the site ever said no.
  if (flag === "refused") return "refused"

  // Already with this request's own driver — a collect at a trip stop moved it
  // there. Neither a conflict nor a pending stop.
  //
  // `dispatched` rather than `=== "In Transit"`: a request whose tools go out
  // over several trips sits at `Partially Delivered` from the first drop
  // onwards, so a later trip carrying the rest would otherwise fail this test,
  // fall past `isReadyForDispatch` and show tools on the truck in red.
  if (dispatched(request.status) && tool.status === TOOL_STATUS_IN_TRANSIT && tool.location === request.driver) {
    return "carried"
  }

  // Tested before `not-ready` because a skip leaves the tool `Pickup
  // Requested`, which fails `isReadyForDispatch` and would otherwise report
  // this request's own tool as out on somebody else's. No status gate: a
  // `triptool` row saying `Skipped` *is* a decision a trip made, where the
  // `statusNew` this once inferred from is ambiguous — on a job site it equally
  // means a pickup request wants the tool, which stays a genuine blocker.
  if (flag === "skipped") return "left-behind"

  // **A pickup request's own tools always read `Pickup Requested` on a job
  // site** — `new-pickup-request` writes exactly that across every tool the PM
  // named, at creation (3B), and nothing moves them until a driver collects
  // them. So for a pickup request that value is this request's *own* signal,
  // never another request's claim and never an inferred skip:
  //
  // - Falling through to `isReadyForDispatch`, which rejects `Pickup Requested`
  //   by design, painted every tool on every pickup request red as "Out on
  //   another request, at <location>" — naming this request's own job as the
  //   culprit. That is what this branch fixes.
  // - The `flagged` heuristic below is equally meaningless here: it is true of
  //   *every* uncollected tool on a pickup request from the moment it is
  //   created, so it can never tell one a driver went without from one the trip
  //   hasn't reached yet. `flag` above is the ground truth for that, and it is
  //   already tested.
  //
  // Collecting the tool is the whole job, so it reads as the stop it is.
  // Delivery requests never reach this branch — `isPickupRequest` is
  // pickup-only, the same test `hasLanded` and `requestSteps` use — so the
  // delivery path keeps `flagged` exactly as it was.
  if (isPickupRequest(request) && tool.status === TOOL_STATUS_PICKUP_REQUESTED) {
    return isWarehouseLocation(tool.location) ? null : "pending-pickup"
  }

  // The pre-phase-4 skip signal, delivery side only — see `flagged` above.
  if (request.status === "In Transit" && flagged) return "left-behind"

  if (!isReadyForDispatch(tool.status)) return "not-ready"
  if (!isWarehouseLocation(tool.location)) return "pending-pickup"
  return null
}

/**
 * Whether this request has actually sent tools out. Both partials count — a
 * request is `Partially Delivered` from its first drop onwards while the rest
 * of its load is still moving, so treating only `In Transit` as "on the road"
 * misreads every request that goes out over more than one trip.
 */
function dispatched(status: ToolRequest["status"]): boolean {
  return status !== "New" && status !== "Assigned"
}
