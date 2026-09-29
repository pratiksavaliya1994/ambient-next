import "server-only"

import { z } from "zod"

import { bubbleRunWorkflow } from "@/lib/bubble/client"

/**
 * Marks a stop with nothing at it done: `tripstop.doneAt = now`.
 *
 * Its own module rather than a seventh workflow in `trips.ts`, which is at its
 * cap. The Studio side is `mark-trip-stop-done` — see
 * `docs/trip-manual-stops.md`. Like the other run workflows it is wrapped in an
 * endpoint-level *Only when* on `trip.status is "In Transit"`, so an empty
 * response is the refusal (the same signal `refused()` in `trips.ts` reads).
 *
 * Replaying it is harmless: the step is conditioned on `doneAt is empty`, so a
 * second call keeps the first time.
 */

const MARK_TRIP_STOP_DONE = "mark-trip-stop-done"

const result = z.looseObject({ ok: z.boolean(), stops: z.number() })

export async function markTripStopDone(tripId: string, stopKey: string): Promise<void> {
  const raw = await bubbleRunWorkflow(MARK_TRIP_STOP_DONE, { tripId, stopKey })
  if (typeof raw === "object" && raw !== null && Object.keys(raw).length === 0) {
    throw new Error("This trip isn't running — it may already be completed. Reload the page.")
  }
  const parsed = result.parse(raw)
  if (!parsed.ok || parsed.stops !== 1) {
    throw new Error(`Bubble found ${parsed.stops} stops for that key instead of one. Reload the trip.`)
  }
}
