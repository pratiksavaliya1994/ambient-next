import "server-only"

import { assignMaterials, targetsLanded, waitForMaterialLines } from "@/lib/bubble/requested-materials"
import { holdsStock, lineProgress } from "@/lib/bubble/requested-materials-types"
import type { ToolRequest } from "@/lib/bubble/requests"
import type { LineTripRow } from "@/lib/bubble/trip-materials-types"

/**
 * Puts a request's unshipped warehouse stock back on the shelf — shared by
 * Close and Cancel, both of which end a request that may still hold some.
 *
 * Runs **before** the terminal status, because nothing re-opens a closed or
 * cancelled request, so one ended while holding stock would hold it for good.
 * Only inventory delivery lines hold stock (`holdsStock`, Bubble's own test);
 * each is lowered to what was actually dropped **from the warehouse** —
 * `lineProgress` without `linked`, so units a transfer brought in are never
 * counted as shelf stock.
 *
 * Retrying is safe — the release is a target, so a second press writes only
 * what the first didn't.
 */
export async function releaseUnshippedStock(
  request: ToolRequest,
  tripRows: readonly LineTripRow[],
  byName: string
): Promise<{ error: string } | { released: boolean }> {
  const releases = request.materialLines
    .filter((line) => holdsStock(line, request))
    .map((line) => ({ lineId: line.id, targetQty: lineProgress(line, tripRows).delivered, from: line.assignedQty }))
    .filter((entry) => entry.from > entry.targetQty)
    .map(({ lineId, targetQty }) => ({ lineId, targetQty }))

  if (releases.length === 0) return { released: false }

  try {
    await assignMaterials(request.id, releases, byName, { release: true })
    const { settled } = await waitForMaterialLines(request.id, targetsLanded(releases))
    if (!settled) {
      return { error: "Bubble is still returning this request's unshipped stock. Try again in a moment." }
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Couldn't return the unshipped stock: ${error.message}`
          : "Couldn't return the unshipped stock.",
    }
  }
  return { released: true }
}
