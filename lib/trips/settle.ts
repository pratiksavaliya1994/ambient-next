import "server-only"

import { readTripPlanKeys } from "@/lib/bubble/trips-read"
import type { PlannedItem, PlannedStop } from "@/lib/trips/plan-types"

/**
 * Waiting for a just-saved plan to actually be there.
 *
 * `create-trip` and `save-trip` create their `tripstop` and `triptool` rows
 * through *Schedule API Workflow on a list*, which is **asynchronous**: Bubble
 * returns as soon as the runs are queued, and the workflow's `stops`/`items`
 * counts are the counts of what was *sent*, not of what has been written. So
 * the action returns, the browser navigates to the run sheet, and the page
 * reads a plan that is still arriving — a stop whose tools haven't landed
 * renders as "Nothing happens here", and a tool whose stops haven't landed
 * renders nowhere at all. On a save it is worse than on a create, because
 * `save-trip` deletes the old rows first: the previous plan is already gone.
 *
 * A reload a moment later looks right, which is exactly the tell.
 *
 * So the action waits here before it returns. Key sets rather than counts:
 * counting cannot tell a new row that has landed from an old one Bubble's
 * search index hasn't dropped yet, and during a save both are in flight at
 * once.
 *
 * The ladder gives up after about five seconds. Not settling is **not** a
 * failure — the write was accepted and the rows will appear; it only means the
 * screen the dispatcher is about to see may be short, which is what the
 * caller's warning says.
 */

const RETRY_DELAYS_MS = [250, 500, 900, 1400, 2000] as const

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function sameKeys(live: ReadonlySet<string>, expected: ReadonlySet<string>): boolean {
  return live.size === expected.size && [...expected].every((key) => live.has(key))
}

/** `true` once Bubble holds exactly this plan; `false` if it still didn't after the last try. */
export async function waitForTripPlan(
  tripId: string,
  stops: readonly PlannedStop[],
  items: readonly PlannedItem[]
): Promise<boolean> {
  const expectedStops = new Set(stops.map((stop) => stop.stopKey))
  const expectedTools = new Set(items.map((item) => item.toolId))

  for (let attempt = 0; ; attempt++) {
    const live = await readTripPlanKeys(tripId)
    if (sameKeys(live.stopKeys, expectedStops) && sameKeys(live.toolIds, expectedTools)) return true
    if (attempt === RETRY_DELAYS_MS.length) return false
    await sleep(RETRY_DELAYS_MS[attempt])
  }
}

/** What the dispatcher is told when the fan-out is still running. One sentence, in both actions. */
export const PLAN_STILL_LANDING =
  "Saved, but Bubble is still writing the stops. The run sheet may look short for a moment — reload it."
