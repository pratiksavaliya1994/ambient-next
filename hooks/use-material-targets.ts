"use client"

import { useState } from "react"

import { effectiveQty, holdsStock, type MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { MaterialTargetValues } from "@/lib/schemas/material"

/**
 * The assign card's draft: a **target** quantity per line, nothing written
 * until Save, and the bounds each stepper is held to.
 *
 * The bounds mirror `prepareMaterialSave`'s refusals so nobody builds a save
 * that will be rejected — they are a convenience, and the action is the guard:
 *
 * - **max** is `min(requested − linked coverage, assigned + what the shelf
 *   still has)`. "What the shelf still has" is the item's stock less whatever
 *   *other* lines on this request naming the same item are drawing in the same
 *   draft: two lines can name one item, and the action checks stock per item
 *   across the whole save, so the UI has to as well. Linked coverage (5F) is
 *   what pickups at other sites are bringing. A line already assigned above
 *   that may stay where it is — the action allows any decrease — but can't go
 *   higher. A line that doesn't draw stock (a pickup, or a non-inventory line)
 *   is bounded by `requested` alone.
 * - **min** is what's already on trips — can't unassign what's on a truck.
 *
 * A draft above its line's bound is **clamped as it's read**, not stored: after
 * a transfer is linked the page revalidates, the bound drops, and the draft
 * follows on the next render without an effect.
 *
 * After a save the route revalidates, `lines` arrive with the new
 * `assignedQty`, and the draft — still holding those same numbers — reads clean
 * again on its own.
 */
export function useMaterialTargets({
  lines,
  stock,
  floors,
  coverage,
  pickup,
}: {
  lines: MaterialLine[]
  /** `materialitem.stockQty` by item id, read fresh by the page. */
  stock: Record<string, number>
  /** Units already on trips, by line id — `lineProgress().onTrips`. */
  floors: Record<string, number>
  /** Units linked pickups are bringing, by delivery line id — `lineProgress().linkedCoverage`. */
  coverage: Record<string, number>
  pickup: boolean
}) {
  const initial = () => Object.fromEntries(lines.map((line) => [line.id, line.assignedQty]))
  const [targets, setTargets] = useState<Record<string, number>>(initial)

  /** The stored draft, unclamped — what another line's bound subtracts. */
  const draftOf = (line: MaterialLine) => targets[line.id] ?? line.assignedQty

  function boundsOf(line: MaterialLine): { min: number; max: number } {
    const requested = effectiveQty(line)
    const min = Math.min(floors[line.id] ?? 0, requested)
    if (!holdsStock(line, { pickup }) || !line.materialId) return { min, max: requested }

    const drawnByOthers = lines
      .filter((other) => other.id !== line.id && other.materialId === line.materialId)
      .reduce((sum, other) => sum + (draftOf(other) - other.assignedQty), 0)
    const available = Math.max(0, (stock[line.materialId] ?? 0) - drawnByOthers)
    const uncovered = Math.max(0, requested - (coverage[line.id] ?? 0))
    return { min, max: Math.max(min, Math.min(Math.max(uncovered, line.assignedQty), line.assignedQty + available)) }
  }

  // Only ever down: the stepper already holds the floor, and raising a saved
  // value to it here would invent a change nobody made.
  const targetOf = (line: MaterialLine) => Math.min(boundsOf(line).max, draftOf(line))

  const changed: MaterialTargetValues = lines
    .filter((line) => targetOf(line) !== line.assignedQty)
    .map((line) => ({ lineId: line.id, targetQty: targetOf(line) }))

  return {
    targetOf,
    boundsOf,
    changed,
    setTarget: (lineId: string, qty: number) => setTargets((current) => ({ ...current, [lineId]: qty })),
    reset: () => setTargets(initial()),
  }
}
