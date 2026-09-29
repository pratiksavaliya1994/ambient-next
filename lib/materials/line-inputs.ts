import type { MaterialItem } from "@/lib/bubble/material-items-types"
import type { MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { MaterialLineInput } from "@/lib/schemas/material"

/** What a row needs to draw a line — a form's unsaved line and a saved `MaterialLine` both fit. */
export type MaterialLineDisplay = Pick<MaterialLine, "kind" | "name" | "quantity" | "unit">

/**
 * Pure edits on a request form's material lines — the array `materialLines`
 * holds before submit. Client-safe; nothing here touches Bubble.
 *
 * An inventory item appears **at most once** in the list: picking it again
 * changes its quantity rather than adding a second line, so the warehouse sees
 * one "Thinset: 12 bag" rather than two lines to add up.
 */

/** The quantity already on the list for a catalogue item, or 0. */
export function inventoryQtyOf(lines: readonly MaterialLineInput[], materialId: string): number {
  const line = lines.find((entry) => entry.kind === "Inventory" && entry.materialId === materialId)
  return line?.quantity ?? 0
}

/** Sets a catalogue item's quantity: appends it, updates it in place, or drops it at 0. */
export function setInventoryQty(
  lines: readonly MaterialLineInput[],
  materialId: string,
  quantity: number
): MaterialLineInput[] {
  const index = lines.findIndex((entry) => entry.kind === "Inventory" && entry.materialId === materialId)
  if (quantity <= 0) return index === -1 ? [...lines] : lines.filter((_, at) => at !== index)
  if (index === -1) return [...lines, { kind: "Inventory", materialId, quantity }]
  return lines.map((entry, at) => (at === index ? { ...entry, quantity } : entry))
}

/**
 * How a line reads on screen. An inventory line carries only an id, so its
 * name and unit come from the catalogue the page loaded — and an item retired
 * since then says so rather than disappearing, because the submit will refuse
 * it and the PM needs to see which one to remove.
 */
export function toLineDisplay(line: MaterialLineInput, itemsById: ReadonlyMap<string, MaterialItem>): MaterialLineDisplay {
  if (line.kind === "NonInventory") {
    return { kind: line.kind, name: line.name, quantity: line.quantity, unit: line.unit || null }
  }
  const item = itemsById.get(line.materialId)
  return {
    kind: line.kind,
    name: item ? item.name : "Item no longer in the catalogue",
    quantity: line.quantity,
    unit: item?.unit || null,
  }
}
