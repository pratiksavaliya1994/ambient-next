import "server-only"

import { isOpenRequest } from "@/lib/bubble/enums"
import { listMaterialItemsByIds } from "@/lib/bubble/material-items"
import { assignMaterials, targetsLanded, waitForMaterialLines, type MaterialTarget } from "@/lib/bubble/requested-materials"
import {
  effectiveQty,
  holdsStock,
  lineProgress,
  type MaterialLine,
} from "@/lib/bubble/requested-materials-types"
import type { ToolRequest } from "@/lib/bubble/requests"
import { listTripMaterialsForLines } from "@/lib/bubble/tripmaterial-read"
import { syncRequestStatuses } from "@/lib/trips/sync-request-status"

/**
 * The material half of `saveAssignmentAction`, split into a check and a write
 * so the combined save can refuse *before* either half touches Bubble.
 *
 * Its own file because `actions.ts` is already long, and because nothing here
 * shares a step with the tool save: tools are a wholesale replace of
 * `assignedtools` rows, materials are a **target per line** on a row that never
 * moves.
 *
 * Every rule below is also shown as a bound in the UI; this is the guard,
 * because a server action is reachable by direct POST and the page is however
 * old its render is. All reads are fresh, taken right before the write. Bubble
 * has no transactions, so two managers taking the last units at the same
 * second can still both succeed — the accepted race in Known limits.
 *
 * `commit` resolves to warnings: once `assignMaterials` is accepted the save
 * happened, and a late or half fan-out is something to reload and check, not a
 * failure.
 */
export async function prepareMaterialSave(
  request: ToolRequest,
  targets: readonly MaterialTarget[],
  byName: string
): Promise<{ error: string } | { commit: () => Promise<string[]> }> {
  const linesById = new Map(request.materialLines.map((line) => [line.id, line]))
  const changed = targets.filter((target) => target.targetQty !== linesById.get(target.lineId)?.assignedQty)
  if (changed.length === 0) return { commit: async () => [] }

  if (!isOpenRequest(request.status)) {
    return { error: `This request is already ${request.status}. No materials can be assigned to it.` }
  }
  if (changed.some((target) => !linesById.has(target.lineId))) {
    return { error: "A material line isn't on this request any more. Reload the page." }
  }

  const [items, tripRows] = await Promise.all([
    listMaterialItemsByIds(request.materialLines.flatMap((line) => (line.materialId ? [line.materialId] : []))),
    listTripMaterialsForLines(request.materialLines.map((line) => line.id)),
  ])
  const stockById = new Map(items.map((item) => [item.id, item.stockQty]))

  // Stock drawn per item across the whole save — two lines can name one item.
  const drawn = new Map<string, number>()

  for (const target of changed) {
    const line = linesById.get(target.lineId) as MaterialLine
    const refusal = refuseLine(line, target.targetQty, lineProgress(line, tripRows).onTrips)
    if (refusal) return { error: refusal }

    if (holdsStock(line, request) && line.materialId) {
      const increase = target.targetQty - line.assignedQty
      drawn.set(line.materialId, (drawn.get(line.materialId) ?? 0) + increase)
    }
  }

  for (const [materialId, increase] of drawn) {
    if (increase <= 0) continue
    const stock = stockById.get(materialId)
    const name = request.materialLines.find((line) => line.materialId === materialId)?.name ?? "That material"
    if (stock === undefined) return { error: `${name} is no longer in the catalogue.` }
    // A partial target is fine — that's the partial-assign rule. Only more
    // than the shelf holds is refused.
    if (increase > stock) {
      return { error: `Only ${Math.max(0, stock)} ${name} in stock — assign ${Math.max(0, stock)} or fewer more.` }
    }
  }

  return {
    commit: async () => {
      try {
        await assignMaterials(request.id, changed, byName)
      } catch (error) {
        throw new Error(
          error instanceof Error ? `Bubble rejected the materials: ${error.message}` : "Bubble rejected the materials."
        )
      }

      // From here on the write was accepted, so everything is a warning. The
      // fan-out is asynchronous and can half-fail — which is why it's checked.
      const warnings: string[] = []
      const { settled, lines } = await waitForMaterialLines(request.id, targetsLanded(changed)).catch(() => ({
        settled: false,
        lines: [] as MaterialLine[],
      }))
      if (!settled) {
        const short = changed
          .filter((target) => lines.find((line) => line.id === target.lineId)?.assignedQty !== target.targetQty)
          .map((target) => linesById.get(target.lineId)?.name)
        warnings.push(`Bubble hasn't finished saving ${short.join(", ") || "some lines"} — reload to check`)
      }

      const sync = await syncRequestStatuses([request.id])
      if (sync.warning) warnings.push(sync.warning)
      return warnings
    },
  }
}

/** Why one line's target can't be saved, or `null`. Stock is checked per item, after. */
function refuseLine(line: MaterialLine, targetQty: number, onTrips: number): string | null {
  const requested = effectiveQty(line)
  if (targetQty > requested) {
    return `${line.name}: only ${requested} ${requested === 1 ? "was" : "were"} requested.`
  }
  // Approve or not — there's no partial state without stock behind it.
  if (line.kind === "NonInventory" && targetQty !== 0 && targetQty !== requested) {
    return `${line.name} is approved whole or not at all.`
  }
  if (targetQty < onTrips) {
    return `${line.name}: ${onTrips} ${onTrips === 1 ? "is" : "are"} already on a trip and can't be unassigned. Take ${onTrips === 1 ? "it" : "them"} off the trip first.`
  }
  return null
}
