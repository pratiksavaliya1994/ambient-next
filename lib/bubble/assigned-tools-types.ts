import type { ToolType } from "@/lib/bubble/reference-types"
import type { ToolLine } from "@/lib/bubble/tools-summary"

/**
 * Types the assign screen's client island needs from `assignedtools` and
 * `tools`, plus the one pure function that shapes them into slots.
 *
 * Split out of `assigned-tools.ts` because that module is `server-only` —
 * same reason `pickup-tools-types.ts` and `reference-types.ts` exist. Nothing
 * here touches Bubble.
 */

/** One `assignedtools` row: a physical tool put against a request. */
export type AssignedTool = {
  id: string
  requestId: string
  toolId: string
  /**
   * The `toolstype` name from `toolsSummary` this tool fills — **stored at
   * assign time, never re-derived**. Re-matching `tools.type` → `toolstype.name`
   * against `toolsSummary` on every render breaks on renamed types, blank or
   * dangling `tools.type`, and names `parseToolsSummary` can't round-trip.
   */
  toolType: string
  /** True when the tool wasn't requested — an addition, not a slot fill. */
  extra: boolean
}

/**
 * One entry of what the assign screen submits — the shape the
 * `create-assigned-tool` workflow's `assignments` parameter takes, one object
 * per `assignedtools` row it creates.
 *
 * Sent as **real JSON objects**, not an encoded string list: the workflow's
 * parameter was defined with Bubble's Detect Data, so there is no `::` codec
 * on either side (unlike `tool-status-updates.ts`, whose workflow still splits
 * a delimited text).
 */
export type AssignmentEntry = {
  toolId: string
  /** True when the tool fills no requested slot — an addition, not a slot fill. */
  extra: boolean
  /** The requested `toolstype` name this tool fills. Stored in Bubble, never re-derived. */
  toolType: string
}

/** A physical `tools` row as the assign screen offers it. */
export type CandidateTool = {
  id: string
  name: string
  typeId: string | null
  typeName: string | null
  /**
   * `tools.statusNew` — the phase 2 lifecycle field, **not** the old
   * `tools.status`. This is the field `isAssignable` filters on, so what the
   * screen shows and what it hides agree. Empty when the row has no
   * `statusNew`, which after the backfill means a data gap.
   */
  status: string
  location: string
  floor: string | null
  currentUser: string | null
}

/** Why a tool can't be picked: another request already holds it over this one's dates. */
export type Conflict = {
  requestId: string
  job: string
  start: string | null
  end: string | null
}

/**
 * One requested tool type on the assign screen: how many were asked for, which
 * physical tools currently fill it, and the `toolstype` its candidates come
 * from — `null` when the name doesn't resolve to one, in which case the slot
 * falls back to the search dialog rather than being unfillable.
 */
export type AssignSlot = {
  toolType: string
  requested: number
  consumable: boolean
  typeId: string | null
  toolIds: string[]
}

export type SlotPlan = {
  slots: AssignSlot[]
  /** Tools assigned to the request that fill no slot — extras, and orphans of a renamed type. */
  extraToolIds: string[]
}

/** How a `toolsSummary` name and a `toolstype.name` are compared. */
function normalise(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * The requested lines and the stored assignments, zipped into slots.
 *
 * Grouping is on the **stored** `toolType` string, so a slot keeps its tools
 * even if the `toolstype` row is later renamed. Name → id resolution is used
 * only to *offer* candidates; when it fails the slot still renders, just
 * without a preloaded candidate list.
 */
export function buildSlots(
  requestedLines: readonly ToolLine[],
  assigned: readonly AssignedTool[],
  toolTypes: readonly ToolType[]
): SlotPlan {
  // Live `toolstype` names are near-unique after normalising but not
  // guaranteed to be — the spike (step 1) reports collisions. First row wins;
  // the loser's slot simply offers the winner's candidates, and the search
  // dialog is the way out.
  const typeIdByName = new Map<string, string>()
  const consumableByName = new Map<string, boolean>()
  for (const type of toolTypes) {
    const key = normalise(type.name)
    if (!typeIdByName.has(key)) typeIdByName.set(key, type.id)
    if (!consumableByName.has(key)) consumableByName.set(key, type.consumable)
  }

  const filled = new Map<string, string[]>()
  const extraToolIds: string[] = []
  const requestedNames = new Set(requestedLines.map((line) => line.name))

  for (const row of assigned) {
    if (row.extra || !requestedNames.has(row.toolType)) {
      extraToolIds.push(row.toolId)
      continue
    }
    const ids = filled.get(row.toolType) ?? []
    ids.push(row.toolId)
    filled.set(row.toolType, ids)
  }

  const slots = requestedLines.map((line) => ({
    toolType: line.name,
    requested: line.quantity,
    consumable: consumableByName.get(normalise(line.name)) ?? false,
    typeId: typeIdByName.get(normalise(line.name)) ?? null,
    toolIds: filled.get(line.name) ?? [],
  }))

  return { slots, extraToolIds }
}
