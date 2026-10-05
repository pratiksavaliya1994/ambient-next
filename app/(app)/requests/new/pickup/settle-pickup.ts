import "server-only"

import { materialLinesWarning } from "@/lib/bubble/requested-materials"

/**
 * After a pickup create: waits for its material lines to land, and warns if
 * they haven't.
 *
 * No status sync. `new-pickup-request` stamps `Assigned`, which is right for a
 * pickup whatever it carries: its tools are named and its material lines need
 * no approval (they count as approved by being on the request, the way its
 * tools are assigned by being named — see `pickupProgress`).
 *
 * Its own module, not in `actions.ts`: everything a `"use server"` file
 * exports is a POST-reachable action, and this one checks no session.
 */
export async function settleNewPickup(requestId: string, lines: number): Promise<string | undefined> {
  return materialLinesWarning(requestId, lines)
}
