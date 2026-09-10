/**
 * Encodes which `tools` rows had their `statusNew` changed in the Pickup
 * picker, for the `new-pickup-request` workflow's `toolStatusUpdates`
 * parameter (a list of texts). Each entry is `"{tools._id}::{status}"` — the
 * workflow splits on `::` to find the row and its new status, same
 * encode-a-string-then-split shape as `tools-summary.ts`'s `Name: quantity`
 * codec, just keyed by id instead of name since this write targets a
 * specific `tools` row rather than describing a list for display.
 *
 * Only tools whose status actually changed are included — an unchanged tool
 * sends nothing, so this table isn't rewritten on every pickup.
 */

import type { ToolStatusNew } from "@/lib/bubble/enums"

export type ToolStatusUpdate = { toolId: string; status: ToolStatusNew }

export function formatToolStatusUpdates(updates: readonly ToolStatusUpdate[]): string[] {
  return updates.map((update) => `${update.toolId}::${update.status}`)
}
