"use server"

import { revalidatePath } from "next/cache"

import { requireSession } from "@/lib/auth/session"
import { completeTrip, completeTripStop, startTrip } from "@/lib/bubble/trips"
import { getTrip, listToolClaims } from "@/lib/bubble/trips-read"
import {
  dropOutcome,
  outstandingCollect,
  outstandingDrop,
  refusable,
  stillLoaded,
  stopWork,
  type TripDetail,
} from "@/lib/bubble/trips-types"
import { syncRequestStatuses } from "@/lib/trips/sync-request-status"
import { completeStopSchema, completeTripSchema, startTripSchema } from "@/lib/schemas/trip"
import type { TripRunState } from "@/app/(app)/trips/action-state"

/**
 * Running a trip: the three moments that actually move inventory.
 *
 * Each one writes `tools` and `triptool` together inside a single Bubble
 * workflow, then recomputes `request.status` in a **separate** call. The split
 * is deliberate — a stop's drops can span several requests, and each of those
 * requests may land on a different status, which a single list-change cannot
 * express.
 *
 * Order matters and is always the same: move the tools, then derive the
 * statuses from what actually landed. Deriving first would compute the status
 * the request had a moment ago.
 */

function revalidateTrip(trip: TripDetail): void {
  revalidatePath("/trips")
  revalidatePath(`/trips/${trip.id}`)
  revalidatePath("/requests")
  revalidatePath("/tools")
  for (const requestId of new Set(trip.items.map((item) => item.requestId).filter(Boolean))) {
    revalidatePath(`/requests/${requestId}`)
  }
}

/**
 * Sends the trip out — and moves no tools.
 *
 * Start used to load whatever the first stop collected, on the reasoning that
 * the driver loads the van before leaving. It doesn't hold: the first stop is
 * a place on the route like any other, and pre-loading it handed the driver a
 * trip whose first stop was already ticked off, with no way to say which tools
 * actually made it into the van. Every collect is recorded where it happens,
 * through `completeStopAction`, including the first.
 */
export async function startTripAction(input: unknown): Promise<TripRunState> {
  await requireSession()

  const parsed = startTripSchema.safeParse(input)
  if (!parsed.success) return { status: "error", message: "That isn't a valid trip." }

  const trip = await getTrip(parsed.data.tripId)
  if (!trip) return { status: "error", message: "That trip no longer exists." }
  if (trip.status !== "Planned") {
    return { status: "error", message: `This trip is already ${trip.status}. Reload the page.` }
  }
  if (!trip.driver) return { status: "error", message: "This trip has no driver. Edit it before starting." }

  // Re-check the claim immediately before writing. The pool check happened when
  // the draft was built, which may have been yesterday — this narrows the window
  // to about a second. It cannot close it: Bubble has no transactions.
  const claims = await listToolClaims(trip.items.map((item) => item.toolId))
  for (const [toolId, other] of claims) {
    if (other.id === trip.id) continue
    const name = trip.items.find((item) => item.toolId === toolId)?.toolName ?? "A tool"
    return {
      status: "error",
      message: `${name} is on ${other.driver ?? "another"}'s trip, which started first. Edit this trip to drop it.`,
    }
  }

  // No `isReadyForDispatch` sweep here any more: nothing loads at start, so
  // there is no tool whose live status this write could contradict. A collect
  // is gated on its own `triptool` row when the driver records the stop — which
  // is also the only reading that lets a pickup leg run at all, its tools being
  // `Pickup Requested` and so never "ready for dispatch".
  try {
    await startTrip(trip.id, trip.driver)
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the start: ${error.message}` : "Bubble rejected the start.",
    }
  }

  const { warning } = await syncRequestStatuses(
    trip.items.map((item) => item.requestId),
    trip.driver
  )

  revalidateTrip(trip)
  return { status: "started", warning }
}

/**
 * One stop, recorded.
 *
 * `dropStatus` is **not** taken from the client — it is read off the stop's own
 * stored `kind`, which is what makes a warehouse drop return a tool to
 * `Available` and a job drop land it `Delivered` with no per-tool branching.
 * Trusting the client with it would let a direct POST mark a job delivery as
 * "back in the yard".
 *
 * The same rule splits the drops in two. A tool the client ticks off is either
 * an ordinary drop or a refused one coming home, and which it is depends on the
 * state its row already holds — a fact the server has just re-read and the
 * browser can only assert.
 */
export async function completeStopAction(input: unknown): Promise<TripRunState> {
  await requireSession()

  const parsed = completeStopSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "That stop isn't valid." }
  }
  const { tripId, stopKey, dropToolIds, loadToolIds, skipToolIds, refuseToolIds } = parsed.data

  const trip = await getTrip(tripId)
  if (!trip) return { status: "error", message: "That trip no longer exists." }
  if (trip.status !== "In Transit") {
    return { status: "error", message: `This trip is ${trip.status}, not under way. Reload the page.` }
  }
  if (!trip.driver) return { status: "error", message: "This trip has no driver. Reload the page." }

  const work = stopWork(trip).find((entry) => entry.stop.stopKey === stopKey)
  if (!work) return { status: "error", message: "That stop isn't on this trip. Reload the page." }

  // Every id must actually belong to this stop, on the right side of it, and
  // still be outstanding there. Membership alone isn't enough on either count:
  // taken on trust, a direct POST could drop a tool at a stop it was never
  // routed to — `dropLocation` below would then write that stop's location onto
  // it — or a tab left open on an already-recorded stop could resubmit and drop
  // a tool that is `Planned`, marking a tool nobody ever collected `Delivered`.
  const collectable = new Set(outstandingCollect(work).map((item) => item.toolId))
  const droppable = new Set(outstandingDrop(work).map((item) => item.toolId))
  // `refusable` answers three questions at once — on the truck, waiting here,
  // and this is a job site rather than the yard. The checkbox is simply hidden
  // at a warehouse; hiding a control is not a boundary, this is.
  const refusables = new Set(refusable(work).map((item) => item.toolId))

  if (dropToolIds.some((id) => !droppable.has(id))) {
    return {
      status: "error",
      message: "One of those tools isn't on the truck waiting to be dropped here. Reload the page.",
    }
  }
  if ([...loadToolIds, ...skipToolIds].some((id) => !collectable.has(id))) {
    return {
      status: "error",
      message: "One of those tools isn't still to be collected here. Reload the page.",
    }
  }
  if (refuseToolIds.some((id) => !refusables.has(id))) {
    return {
      status: "error",
      message:
        work.stop.kind === "Warehouse"
          ? "Tools can't be turned away at the yard — that's where they come back to."
          : "One of those tools isn't a delivery waiting at this stop. Reload the page.",
    }
  }

  const outcome = dropOutcome(work.stop.kind)
  // A ticked drop is a return if its row already says the site sent it back.
  // Both halves move the tool identically; only the state they write differs,
  // and `Returned` is what keeps the row pinned to the yard afterwards rather
  // than drifting back to the address that refused it.
  const refusedHere = new Set(
    work.drop.filter((item) => item.state === "Refused").map((item) => item.toolId)
  )
  const returnToolIds = dropToolIds.filter((id) => refusedHere.has(id))
  const plainDropToolIds = dropToolIds.filter((id) => !refusedHere.has(id))

  let counts: { dropped: number; loaded: number; skipped: number; refused: number; returned: number }
  try {
    counts = await completeTripStop({
      tripId,
      stopKey,
      driver: trip.driver,
      dropStatus: outcome.status,
      dropLocation: work.stop.location,
      dropToolIds: plainDropToolIds,
      loadToolIds,
      skipToolIds,
      refuseToolIds,
      returnToolIds,
    })
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the stop: ${error.message}` : "Bubble rejected the stop.",
    }
  }

  const touched = [...dropToolIds, ...loadToolIds, ...skipToolIds, ...refuseToolIds]
  const { warning } = await syncRequestStatuses(
    trip.items.filter((item) => touched.includes(item.toolId)).map((item) => item.requestId),
    trip.driver
  )

  revalidateTrip(trip)
  return { status: "stop-done", ...counts, warning }
}

/**
 * Closes the trip.
 *
 * The "anything still on the truck?" guard lives here rather than in Bubble
 * precisely so the message can name the tools — a workflow that merely
 * terminated would leave the driver guessing.
 */
export async function completeTripAction(input: unknown): Promise<TripRunState> {
  await requireSession()

  const parsed = completeTripSchema.safeParse(input)
  if (!parsed.success) return { status: "error", message: "That isn't a valid trip." }

  const trip = await getTrip(parsed.data.tripId)
  if (!trip) return { status: "error", message: "That trip no longer exists." }
  if (trip.status !== "In Transit") {
    return { status: "error", message: `This trip is ${trip.status}, not under way. Reload the page.` }
  }

  const onboard = stillLoaded(trip.items)
  if (onboard.length > 0) {
    const names = onboard.slice(0, 3).map((item) => item.toolName).join(", ")
    return {
      status: "error",
      message:
        onboard.length === 1
          ? `${names} is still on the truck. Record its stop before finishing.`
          : `${onboard.length} tools are still on the truck (${names}${onboard.length > 3 ? ", …" : ""}). Record their stops before finishing.`,
    }
  }

  try {
    await completeTrip(trip.id)
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Bubble rejected the completion.",
    }
  }

  const { warning } = await syncRequestStatuses(
    trip.items.map((item) => item.requestId),
    trip.driver ?? undefined
  )

  revalidateTrip(trip)
  return { status: "completed", warning }
}
