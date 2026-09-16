import "server-only"

import { z } from "zod"

import { bubbleRunWorkflow } from "@/lib/bubble/client"
import type { PlannedItem, PlannedStop, TripStatus, TripToolState } from "@/lib/trips/plan-types"
import type { ToolStatusNew } from "@/lib/bubble/tool-enums"

/**
 * The six Bubble workflows that own a trip's life.
 *
 * **Every tool write a trip makes lives inside one of these**, co-located with
 * the `triptool` state change it belongs to. It is deliberately *not* done by
 * calling `update-request-status` with an empty `requestIds`: step 1 of that
 * workflow is a *Make changes to a list of things* over
 * `Search for request (unique id is in requestIds)`, and Bubble's `is in`
 * against an empty list is ambiguous — in some contexts it constrains nothing
 * and matches the whole table, which here is ~1,550 live requests. Worse, the
 * caller's `result.requests !== requestIds.length` guard passes at `0 !== 0`,
 * so it would report success. See `docs/phase-4-trips.md`.
 *
 * Each call count-checks its response, the pattern every other write module
 * here follows: a mismatch means a fan-out half-landed, and the recovery is
 * always "save again", which the delete-first steps make safe.
 *
 * Workflow names are pinned to module constants rather than inlined — a
 * renamed workflow then fails as one searchable 404 instead of at a call site.
 */

const CREATE_TRIP = "create-trip"
const SAVE_TRIP = "save-trip"
const START_TRIP = "start-trip"
const COMPLETE_TRIP_STOP = "complete-trip-stop"
const COMPLETE_TRIP = "complete-trip"
const CANCEL_TRIP = "cancel-trip"

const createResult = z.looseObject({ tripId: z.string(), stops: z.number(), items: z.number() })
const saveResult = z.looseObject({ stops: z.number(), items: z.number() })
const stopResult = z.looseObject({
  dropped: z.number(),
  loaded: z.number(),
  skipped: z.number(),
  refused: z.number(),
  returned: z.number(),
})
const okResult = z.looseObject({ ok: z.boolean() })

/**
 * Whether Bubble refused the call because the trip was in the wrong state.
 *
 * Five of these six workflows are wrapped in an endpoint-level *Only when* on
 * `trip.status` — `save-trip`, `start-trip` and `cancel-trip` run only on a
 * `Planned` trip, `complete-trip-stop` and `complete-trip` only on an
 * `In Transit` one. When that condition is false Bubble **skips the entire
 * workflow, including its *Return data from API* step**, and still answers
 * `200` with an empty `response`. So an empty object is the refusal signal, and
 * it is the only one there is — there is no error body to read.
 *
 * Without this check the guards doing their job surface as a raw Zod
 * `expected number, received undefined`, which reads like a broken deploy
 * rather than "someone else already started this trip". `create-trip` is the
 * exception and deliberately gets no check: its guard is per-step on the
 * idempotency key, and its return step always runs.
 */
function refused(raw: unknown): boolean {
  return typeof raw === "object" && raw !== null && Object.keys(raw).length === 0
}

export type TripHeaderInput = {
  driver: string
  /**
   * ISO — the New York instant the driver leaves: the day the trip runs *and*
   * its start time, in the one date field `trip` has.
   *
   * It carries a real time rather than midnight because every stop's window is
   * counted forward from it — `lib/trips/schedule.ts` — so this value is read
   * back, not just displayed. Rows written before start times existed hold NY
   * midnight, which `tripStartTime` reads as "no time chosen".
   */
  tripDate: string
  notes: string
}

/** The wire shape of one stop. Sent as a real object via Bubble's Detect Data, not a `::` codec. */
function stopPayload(stop: PlannedStop) {
  return { stopKey: stop.stopKey, seq: stop.seq, location: stop.location, kind: stop.kind }
}

function itemPayload(item: PlannedItem) {
  return {
    toolId: item.toolId,
    requestId: item.requestId,
    toolName: item.toolName,
    toolType: item.toolType,
    fromStopKey: item.fromStopKey,
    fromLocation: item.fromLocation,
    toStopKey: item.toStopKey,
    toLocation: item.toLocation,
  }
}

/**
 * Creates a `Planned` trip with its stops and items.
 *
 * **`idempotencyKey` is required and must be generated once per draft, not per
 * attempt.** `lib/bubble/client.ts` retries a POST up to four times on 429/5xx,
 * and unlike every other write workflow in this app `create-trip` has no
 * delete-first step to absorb a 502-after-commit — without the key, one retry
 * is one duplicate trip holding duplicate claims on real tools. The workflow
 * guards its create steps on the key being unseen and returns the existing
 * trip's id on a repeat, so a retry is a no-op that still answers correctly.
 */
export async function createTrip(
  idempotencyKey: string,
  header: TripHeaderInput,
  stops: readonly PlannedStop[],
  items: readonly PlannedItem[]
): Promise<{ tripId: string }> {
  const raw = await bubbleRunWorkflow(CREATE_TRIP, {
    idempotencyKey,
    ...header,
    stops: stops.map(stopPayload),
    items: items.map(itemPayload),
  })
  const result = createResult.parse(raw)

  assertCounts(result.stops, stops.length, result.items, items.length)
  return { tripId: result.tripId }
}

/**
 * Replaces a `Planned` trip's whole plan — header, stops and items.
 *
 * This is also the **reorder** write: dragging stops and pressing Save re-sends
 * the entire plan, so there is no separate ordering workflow and none of
 * `set-request-order`'s async fan-out race.
 *
 * The workflow **terminates unless the trip is still `Planned`**, and that
 * guard is load-bearing rather than defensive. Saving is delete-then-recreate;
 * run against a trip already under way it would delete `triptool` rows carrying
 * real-world facts (`Dropped`, `Skipped`) and resurrect them as `Planned` —
 * silently un-delivering tools that are physically sitting on a job site.
 */
export async function saveTrip(
  tripId: string,
  header: TripHeaderInput,
  stops: readonly PlannedStop[],
  items: readonly PlannedItem[]
): Promise<void> {
  const raw = await bubbleRunWorkflow(SAVE_TRIP, {
    tripId,
    ...header,
    stops: stops.map(stopPayload),
    items: items.map(itemPayload),
  })
  if (refused(raw)) {
    throw new Error("This trip has already started, so its plan is fixed. Reload the page to see where it got to.")
  }
  const result = saveResult.parse(raw)

  assertCounts(result.stops, stops.length, result.items, items.length)
}

/**
 * Sends the trip out: `Planned` → `In Transit`, and **nothing else**.
 *
 * `toolIds` is sent empty on purpose — the workflow still takes the list (its
 * tool steps gate off on an empty one), but no tool moves at start any more.
 * It used to carry the first stop's collect list, which loaded those tools the
 * instant the driver pressed Start: stop one arrived already `Loaded` and
 * therefore already done, so the driver never got to tick off what they
 * actually put in the van — and a tool left behind at the first stop was
 * recorded as collected. Every collect now happens where it physically
 * happens, through `completeTripStop`.
 */
export async function startTrip(tripId: string, driver: string): Promise<void> {
  const raw = await bubbleRunWorkflow(START_TRIP, { tripId, driver, toolIds: [] })
  if (refused(raw)) {
    throw new Error("This trip has already been started. Reload the page.")
  }
}

export type CompleteStopInput = {
  tripId: string
  stopKey: string
  driver: string
  /** What a drop here writes — `Delivered` for a `Job` stop, `Available` for a `Warehouse` one. */
  dropStatus: ToolStatusNew
  /** The stop's own `location`, written to every dropped tool. */
  dropLocation: string
  dropToolIds: readonly string[]
  loadToolIds: readonly string[]
  /** Tools the driver reached and **couldn't** take. Status only — they do not move. */
  skipToolIds: readonly string[]
  /** Tools this site **turned away**. `triptool` only — they are in the van and stay there. */
  refuseToolIds: readonly string[]
  /** Refused tools now being unloaded at the yard. Moves like a drop, states `Returned`. */
  returnToolIds: readonly string[]
}

/**
 * One stop, five outcomes, one call.
 *
 * `dropStatus` is what makes a pickup and a delivery the same code path: the
 * caller reads it off the stop's stored `kind` (`dropOutcome` in
 * `trips-types.ts`), so a warehouse drop returns a tool to `Available` and a
 * job drop lands it `Delivered`, with no per-tool branching anywhere.
 *
 * The skip list writes `statusNew` and **nothing else** — no `toolLocation`, no
 * `toolUser` — so a tool the driver couldn't take keeps the site it was never
 * collected from, and its `currentUser` is left alone. That is the same
 * contract `leaveToolsBehind` had, carried forward.
 *
 * The refuse list writes **nothing at all to `tools`**, which is the same idea
 * pointed the other way: a tool the site turned away is in the van, `In Transit`
 * at `location = driver`, and every one of those fields is already correct.
 *
 * `returnToolIds` is a second drop list rather than a `dropState` flag because
 * one call can carry both kinds at once — a refusal at a job site rides on to
 * the warehouse stop that was already going to take a planned pickup, and that
 * one call has to write `Dropped` for one tool and `Returned` for the other.
 */
export async function completeTripStop(input: CompleteStopInput): Promise<{
  dropped: number
  loaded: number
  skipped: number
  refused: number
  returned: number
}> {
  const raw = await bubbleRunWorkflow(COMPLETE_TRIP_STOP, {
    tripId: input.tripId,
    stopKey: input.stopKey,
    driver: input.driver,
    dropStatus: input.dropStatus,
    dropLocation: input.dropLocation,
    dropToolIds: [...input.dropToolIds],
    loadToolIds: [...input.loadToolIds],
    skipToolIds: [...input.skipToolIds],
    refuseToolIds: [...input.refuseToolIds],
    returnToolIds: [...input.returnToolIds],
  })
  if (refused(raw)) {
    throw new Error("This trip isn't running — it may already be completed or cancelled. Reload the page.")
  }
  const result = stopResult.parse(raw)

  assertExact(result.dropped, input.dropToolIds.length, "dropped")
  assertExact(result.loaded, input.loadToolIds.length, "collected")
  assertExact(result.skipped, input.skipToolIds.length, "skipped")
  assertExact(result.refused, input.refuseToolIds.length, "refused")
  assertExact(result.returned, input.returnToolIds.length, "returned")

  return result
}

export async function completeTrip(tripId: string): Promise<void> {
  const raw = await bubbleRunWorkflow(COMPLETE_TRIP, { tripId })
  if (refused(raw)) {
    throw new Error("This trip isn't running — it may already be completed. Reload the page.")
  }
  const result = okResult.parse(raw)
  if (!result.ok) throw new Error("Bubble refused to complete this trip. Reload the page.")
}

/**
 * Deletes a draft. **Refuses anything past `Planned`** — a trip that left the
 * yard happened, and its tool writes are already real.
 */
export async function cancelTrip(tripId: string): Promise<void> {
  const raw = await bubbleRunWorkflow(CANCEL_TRIP, { tripId })
  if (refused(raw)) {
    throw new Error("That trip has already started and can't be cancelled.")
  }
  const result = okResult.parse(raw)
  if (!result.ok) throw new Error("Bubble refused to cancel this trip. Reload the page.")
}

function assertCounts(stops: number, expectedStops: number, items: number, expectedItems: number): void {
  if (stops !== expectedStops || items !== expectedItems) {
    throw new Error(
      `Bubble saved ${stops} of ${expectedStops} stops and ${items} of ${expectedItems} tools. ` +
        `Save again — it replaces the whole plan rather than adding to it.`
    )
  }
}

function assertExact(actual: number, expected: number, noun: string): void {
  if (actual !== expected) {
    throw new Error(`Bubble ${noun} ${actual} of ${expected} tools. Reload the trip and check what landed.`)
  }
}

/** Re-exported so callers don't have to reach into two modules for one transition. */
export type { TripStatus, TripToolState }
