/**
 * Encodes which `tools` rows had their `condition` changed in the Pickup
 * picker, for the `new-pickup-request` workflow's `toolStatusUpdates`
 * parameter (a list of texts). Each entry is `"{tools._id}::{condition}"` —
 * the workflow splits on `::` to find the row and its new condition, same
 * encode-a-string-then-split shape as `tools-summary.ts`'s `Name: quantity`
 * codec, just keyed by id instead of name since this write targets a
 * specific `tools` row rather than describing a list for display.
 *
 * Only tools whose condition actually changed are included — an unchanged
 * tool sends nothing, so this table isn't rewritten on every pickup.
 *
 * Phase 3A repointed the Bubble side of this at `tools.condition` instead of
 * `tools.statusNew` — see `docs/phase-3a-condition-split.md`. The Bubble
 * param is still named `toolStatusUpdates`: `new-pickup-request`'s fan-out
 * step reads it by that name, and repointing the helper's *field* didn't
 * require renaming its *input*. Renaming the param is a Studio-side change
 * with no benefit here, so the mismatch between this file's name/exports and
 * the wire parameter name is deliberate.
 */

import type { ToolCondition } from "@/lib/bubble/tool-enums"

export type ToolConditionUpdate = { toolId: string; condition: ToolCondition }

export function formatToolConditionUpdates(updates: readonly ToolConditionUpdate[]): string[] {
  return updates.map((update) => `${update.toolId}::${update.condition}`)
}
