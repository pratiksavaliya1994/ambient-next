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
  /** `tools.condition` — split off `statusNew` in phase 3A. See `lib/bubble/enums.ts`. */
  condition: string
  location: string
  floor: string | null
  currentUser: string | null
}

/**
 * A tool on this request that an open trip is already carrying — one entry per
 * claimed tool, shaped from `listToolClaims` for the browser.
 *
 * The assign screen needs this because **`tools.statusNew` does not say a tool
 * is on a trip until it is physically collected**: `start-trip` moves nothing,
 * so a tool planned onto a saved trip — even one already out on the road —
 * still reads `Assigned` right up until the driver records the stop.
 * `isLockedToTrip` therefore cannot see these at all, and without the claim the
 * remove control is offered on a tool a live `triptool` row is counting on.
 * Saving that removal deletes the `assignedtools` row and frees the tool while
 * the trip still lists it.
 */
export type ToolTripClaim = {
  toolId: string
  tripId: string
  driver: string | null
  /** `trip.status === "In Transit"`. A `Planned` trip can still be edited to drop the tool; this one can't. */
  started: boolean
}

/**
 * A tool that a **different open request** already holds — one entry per
 * claimed tool, shaped from `listRequestClaims` for the browser.
 *
 * This is a *warning*, never a block, and the distinction is the whole point.
 * `isFreeToAssign` deliberately counts `Pickup Requested` as free — a tool
 * somebody has asked to collect is still one you can commit to next week's job,
 * and treating it otherwise would make every awaiting-collection tool
 * unassignable. So booking a tool that is already spoken for stays legal, and
 * is sometimes exactly right: it comes back Tuesday, the job needs it
 * Wednesday.
 *
 * What is not fine is doing it **by accident**. A tool on two open requests
 * produces an outstanding movement under each, and because the trip builder
 * keys selection by tool id — one tool goes on a trip at most once — the two
 * rows share a checkbox and the trip would try to drop one physical object in
 * two places. `validatePlan`'s `duplicate-tool` check refuses that write; this
 * is the same fact said earlier, on the screen that creates it, while avoiding
 * it is still one click.
 *
 * Separate from `ToolTripClaim` because the two answer different questions and
 * have different remedies: that one is a trip already carrying the tool, and it
 * *blocks*; this one is a request merely holding it, and it informs.
 */
export type ToolRequestClaim = {
  toolId: string
  requestId: string
  /** The other request's `job`, so the warning names somewhere the PM recognises. */
  job: string
  /** `isPickupRequest` — "wants it back" reads very differently from "is taking it out". */
  pickup: boolean
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
 * How many tools a slot — or a whole request — holds, against how many were
 * asked for.
 *
 * The requested count is guidance about what the job needs, not a cap on what
 * goes on the truck: a slot can hold more than it. So the two numbers are
 * labelled separately rather than written as "3 of 1", which reads as a bug.
 */
export function assignedLabel(assigned: number, requested: number): string {
  return `${assigned} assigned · ${requested} requested`
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
