import "server-only"

import { listToolsByStatus } from "@/lib/bubble/pickup-tools"
import { TOOL_STATUS_IN_TRANSIT } from "@/lib/bubble/tool-enums"
import { listTripDetails } from "@/lib/bubble/trips-read"
import { buildInTransit, type InTransitLoad } from "@/lib/trips/in-transit"

/**
 * Everything on a truck right now, for `/trips/in-transit`. Two reads side by
 * side: the running trips with their rows (`listTripDetails`, four queries),
 * and the tools whose `statusNew` reads `In Transit` (one filtered query) — the
 * second only for each tool's `condition` and to catch orphans. See
 * `lib/trips/in-transit.ts` for why the trip rows, not `statusNew`, decide.
 *
 * Never memoised: the board polls every 15s and exists to show what changed.
 */
export async function listInTransit(): Promise<InTransitLoad> {
  const [trips, tools] = await Promise.all([
    listTripDetails(["In Transit"]),
    listToolsByStatus(TOOL_STATUS_IN_TRANSIT),
  ])
  return buildInTransit(trips, tools)
}
