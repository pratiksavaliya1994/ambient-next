"use server"

import { revalidatePath } from "next/cache"

import { requireSession } from "@/lib/auth/session"
import { markTripStopDone } from "@/lib/bubble/trip-stop-done"
import { getTrip } from "@/lib/bubble/trips-read"
import { isReturnStop, stopWork } from "@/lib/bubble/trips-types"
import { isEmptyStopWork } from "@/lib/trips/manual-stops"
import { markStopDoneSchema } from "@/lib/schemas/trip"
import type { TripRunState } from "@/app/(app)/trips/action-state"

/**
 * The driver says they have been to a stop with nothing at it — a manual stop
 * no tool or material reached.
 *
 * Only an **empty** stop can be marked this way. Every other stop is done when
 * its rows are, and letting a flag decide one would let a driver tick off a
 * stop with a tool still waiting at it. Nothing in `tools` or `request` moves,
 * so there is no status sync afterwards.
 *
 * Its own file because `actions.ts` beside it is at its cap.
 */
export async function markStopDoneAction(input: unknown): Promise<TripRunState> {
  await requireSession()

  const parsed = markStopDoneSchema.safeParse(input)
  if (!parsed.success) return { status: "error", message: "That stop isn't valid." }
  const { tripId, stopKey } = parsed.data

  const trip = await getTrip(tripId)
  if (!trip) return { status: "error", message: "That trip no longer exists." }
  if (trip.status !== "In Transit") {
    return { status: "error", message: `This trip is ${trip.status}, not under way. Reload the page.` }
  }

  const work = stopWork(trip).find((entry) => entry.stop.stopKey === stopKey)
  if (!work || isReturnStop(work.stop)) {
    return { status: "error", message: "That stop isn't on this trip. Reload the page." }
  }
  if (!isEmptyStopWork(work)) {
    return { status: "error", message: "This stop has tools or materials to record. Record them instead." }
  }
  if (work.stop.doneAt) return { status: "stop-marked" }

  try {
    await markTripStopDone(tripId, stopKey)
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the stop: ${error.message}` : "Bubble rejected the stop.",
    }
  }

  revalidatePath("/trips")
  revalidatePath(`/trips/${tripId}`)
  return { status: "stop-marked" }
}
