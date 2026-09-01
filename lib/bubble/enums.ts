/**
 * Bubble option sets are matched by display text on write, so mirroring them
 * as string-literal unions turns a typo into a compile error rather than a
 * silent no-op.
 *
 * Swagger reports these fields as "option set" but does not expose the value
 * lists, so they were read off the live `version-test` app instead: 200 recent
 * `request` rows for `weAre` / `toDo`, plus the `realtedTo` lists on all 112
 * `toolstype` rows.
 */

export const WE_ARE = [
  "Ambient",
  "Tipp",
  "BT Flooring",
  "Pyramid Floors",
  "Tangent",
  "Corridors Flooring",
  "GP Flooring",
  "SilverSlate",
  "Other (Put Name in Notes)",
] as const
export type WeAre = (typeof WE_ARE)[number]

export const DEFAULT_WE_ARE: WeAre = "Ambient"

/**
 * `toDo` doubles as the job type. `toolsType.realtedTo` holds the same values,
 * which is what filters the tool catalogue down for a given request.
 *
 * "Fast Request" is the exception: no tool type lists it, so it means
 * "no job type — show me everything".
 */
export const TO_DO = [
  "Fast Request",
  "Simple Grind",
  "Rough Grind",
  "Grind & Seal",
  "Grind & Polish",
  "Grind & Level",
  "Grind & Epoxy",
  "Concrete Mixing",
] as const
export type ToDo = (typeof TO_DO)[number]

export const UNFILTERED_TO_DO: ToDo = "Fast Request"

/**
 * `tools.status` — the **original** option set, hardcoded per the user rather
 * than read off live data (the live app only ever had `"Ok"` / `"Missing"` /
 * `"To be Repaired"` rows).
 *
 * Phase 2 does **not** replace this. The lifecycle went to a second field,
 * `tools.statusNew`, backed by a separate `ToolStatusNew` option set, so the
 * old field and its writers — the Pickup picker here, and the pre-existing
 * `/wf/Set Status` in the old Bubble UI — keep working untouched. See
 * `TOOL_STATUS_NEW` below.
 */
export const TOOL_STATUS = [
  "Ok",
  "Ready for Pickup",
  "To do Maintenance",
  "To be Repaired",
  "Repairing / Under Maintenance",
  "Discharged",
  "Missing",
] as const
export type ToolStatus = (typeof TOOL_STATUS)[number]


/**
 * `request.color` drives the event colour in the Bubble calendar. Live rows
 * follow delivery → blue, pickup-only → orange. A third value (#00bc9d) shows
 * up on a handful of hand-edited rows with no discernible rule; it is not
 * reproduced here.
 */
export function requestColor(delivery: boolean, pickup: boolean): string {
  if (delivery) return "#2299ff"
  return pickup ? "#ff7744" : "#2299ff"
}

/** Every live row carries this. The Bubble calendar sorts on it. */
export const DEFAULT_REQUEST_ORDER = 100

/**
 * `request.status` — the phase 2 lifecycle. **Text in Bubble, not an option
 * set** (see `docs/phase-2-lifecycle.md`), so an unexpected value fails loudly
 * in Zod here rather than silently on a Bubble write. A row with no `status`
 * reads as `New`, which is what lets the ~1,550 existing rows stay untouched.
 */
export const REQUEST_STATUS = ["New", "Assigned", "In Transit", "Delivered"] as const
export type RequestStatus = (typeof REQUEST_STATUS)[number]

export const DEFAULT_REQUEST_STATUS: RequestStatus = "New"

/**
 * `tools.statusNew` — the `ToolStatusNew` option set, added for phase 2 rather
 * than renaming the original. `status` above was left alone because it is
 * live and has a second writer this app doesn't control (`/wf/Set Status` in
 * the old Bubble UI); a rename would have moved that writer's rows too.
 *
 * Every live row's `statusNew` was backfilled from `status` in a one-time
 * Bubble migration, so the field is populated everywhere and can be read on
 * its own. `Discharged` has no counterpart here — no live row held it.
 *
 * The cost is that "where is grinder #7" has two answers until the old field
 * is retired, and the two will drift now that only the old one is written.
 * That retirement is deliberately deferred — the existing Tools dashboard and
 * Pickup picker still read and write `status` unchanged, and nothing in this
 * app writes `statusNew` until the `update-request-status` workflow exists.
 *
 * The list mixes *where a tool is in the flow* (Available, Assigned, In
 * Transit, Delivered, Pickup Requested) with *what condition it is in* (the
 * rest). Condition wins for assignment — see `UNASSIGNABLE_TOOL_STATUS`.
 */
export const TOOL_STATUS_NEW = [
  "Available",
  "Assigned",
  "In Transit",
  "Delivered",
  "Pickup Requested",
  "Maintenance Required",
  "Repair Required",
  "Under Repair",
  "Inspection Required",
  "Missing",
] as const
export type ToolStatusNew = (typeof TOOL_STATUS_NEW)[number]

/**
 * The `tools.statusNew` values the lifecycle *writes*, named rather than typed
 * as literals at each call site so no transition can drift.
 *
 * Unused at the moment and kept on purpose: the workflow that writes
 * `statusNew` (`update-request-status`) isn't built yet, and these are what
 * 2B/2C will pass to it instead of bare strings.
 */
export const TOOL_STATUS_AVAILABLE: ToolStatusNew = "Available"
export const TOOL_STATUS_ASSIGNED: ToolStatusNew = "Assigned"
export const TOOL_STATUS_IN_TRANSIT: ToolStatusNew = "In Transit"
export const TOOL_STATUS_DELIVERED: ToolStatusNew = "Delivered"

/**
 * A tool whose `statusNew` reads one of these is never offered for assignment.
 * The five lifecycle values stay offerable: a tool `Delivered` to another job
 * last month is a legitimate pick for next week, and the date-overlap check is
 * what decides that.
 *
 * **This is read from `statusNew` only**, and that field is now backfilled on
 * every live row, so the filter really does hide broken tools — a row whose
 * old `status` said `To be Repaired` reads `Repair Required` here and drops
 * out of the candidate lists.
 *
 * The overlap check in `listTakenToolIds` is a separate and stricter guard: it,
 * not this list, is what prevents a double-booking.
 */
export const UNASSIGNABLE_TOOL_STATUS: readonly string[] = [
  "Maintenance Required",
  "Repair Required",
  "Under Repair",
  "Inspection Required",
  "Missing",
]

/**
 * `statusNew`, not `status`. An empty value stays assignable — but after the
 * backfill it means the row was missed by the migration, so it is worth
 * flagging rather than assuming.
 */
export function isAssignable(statusNew: string): boolean {
  return !UNASSIGNABLE_TOOL_STATUS.includes(statusNew)
}
