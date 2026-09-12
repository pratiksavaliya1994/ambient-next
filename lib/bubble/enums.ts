import { NO_LOCATION } from "@/lib/bubble/pickup-tools-types"

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
 * than renaming the original `status` field, which is still live and has a
 * second writer this app doesn't control (`/wf/Set Status` in the old Bubble
 * UI); a rename would have moved that writer's rows too.
 *
 * Every live row's `statusNew` was backfilled from `status` in a one-time
 * Bubble migration, so the field is populated everywhere and can be read on
 * its own. `Discharged` has no counterpart here — no live row held it.
 *
 * This app now reads and writes `statusNew` exclusively — the Tools
 * dashboard reads it, and the Pickup picker both reads it and writes changes
 * back through `update-tool-status`. The old `status` field is only ever
 * touched by the old Bubble UI now, so the two will drift over time.
 *
 * The list mixes *where a tool is in the flow* (Available, In Transit,
 * Delivered, Pickup Requested) with *what condition it is in* (the rest).
 * Condition wins for assignment — see `UNASSIGNABLE_TOOL_STATUS`.
 *
 * **No `Assigned` value.** Delivery-assign (`assignToolsAction` /
 * `create-assigned-tool`) only ever writes `assignedtools` rows and
 * `request.status` — see `lib/bubble/assigned-tools.ts#assignTools`. A tool
 * assigned to a future request keeps whatever `statusNew` already describes
 * its real current state; the assignment itself is fully and only recorded
 * in `assignedtools`, which is what the date-overlap availability check
 * reads. A dedicated `Assigned` flow value was considered and dropped —
 * writing it at assign time would either clobber a tool's true current state
 * (if it's busy elsewhere) or need to be built, tested and maintained just to
 * cover the one case it's safe (a tool sitting `Available` in the warehouse),
 * for no operational payoff anyone needed.
 *
 * **Phase 3A split condition off this field** into `tools.condition` /
 * `ToolCondition` below. The five condition values (`Maintenance Required`
 * through `Missing`) stay in this option set — an old-Bubble-UI edit could
 * still write one — but this app no longer writes them here; it writes
 * `condition` instead. `isAssignable` checks both fields for exactly that
 * reason.
 */
export const TOOL_STATUS_NEW = [
  "Available",
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
 * `TOOL_STATUS_AVAILABLE` backs `isReadyForDispatch`'s dispatch-time gate, and
 * is also kept for phase 3D (pickup return-to-warehouse). `TOOL_STATUS_IN_TRANSIT` /
 * `TOOL_STATUS_DELIVERED` back dispatch (2B) and offload (2C).
 */
export const TOOL_STATUS_AVAILABLE: ToolStatusNew = "Available"
export const TOOL_STATUS_IN_TRANSIT: ToolStatusNew = "In Transit"
export const TOOL_STATUS_DELIVERED: ToolStatusNew = "Delivered"

/**
 * A tool whose `statusNew` reads one of these is never offered for assignment.
 * The remaining flow values stay offerable: a tool `Delivered` to another job
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
 * `tools.condition` — split off `statusNew` in phase 3A so a PM's condition
 * pick in the Pickup picker survives the pickup lifecycle overwriting
 * `statusNew` with flow values (`In Transit`, `Delivered`, …). Five of the six
 * display texts are shared with `TOOL_STATUS_NEW` on purpose — same words, so
 * the Bubble backfill is a copy rather than a translation, and nothing in the
 * UI changes vocabulary on the user. `Ok` is new: its `statusNew` counterpart
 * was `Available`, which is a *flow* state, not a condition.
 */
export const TOOL_CONDITION = [
  "Ok",
  "Maintenance Required",
  "Repair Required",
  "Under Repair",
  "Inspection Required",
  "Missing",
] as const
export type ToolCondition = (typeof TOOL_CONDITION)[number]

export const DEFAULT_TOOL_CONDITION: ToolCondition = "Ok"

/** Every `ToolCondition` except `Ok`. A tool in any of these is never offered. */
export const UNASSIGNABLE_CONDITION: readonly string[] = TOOL_CONDITION.filter((value) => value !== "Ok")

/**
 * `statusNew`, not `status`. An empty value stays assignable — but after the
 * backfill it means the row was missed by the migration, so it is worth
 * flagging rather than assuming.
 *
 * Checks **both** `condition` and `statusNew` so the filter stays correct at
 * every point in 3A's backfill: before it, `condition` is empty and
 * `statusNew` still carries the five condition values; after it, the reverse.
 * This is the permanent defence, not a transition measure — see
 * `TOOL_STATUS_NEW`'s doc comment.
 */
export function isAssignable(condition: string, statusNew: string): boolean {
  return !UNASSIGNABLE_CONDITION.includes(condition) && !UNASSIGNABLE_TOOL_STATUS.includes(statusNew)
}

/**
 * Whether an already-*assigned* tool is actually sitting at the warehouse
 * right now, as opposed to still mid-flow on a different, not-yet-offloaded
 * request (`In Transit`, `Delivered`, `Pickup Requested`) or flagged for
 * condition. Assign-time deliberately allows any of those — see
 * `TOOL_STATUS_NEW`'s doc — but Dispatch is the moment a tool actually leaves
 * the building, so it needs the stricter, real-time answer this checks instead.
 *
 * Blank stays ready, same leniency as `isAssignable`: after the backfill an
 * empty `statusNew` is a migration gap, not a signal the tool is unavailable.
 */
export function isReadyForDispatch(statusNew: string): boolean {
  return statusNew === "" || statusNew === TOOL_STATUS_AVAILABLE
}

/**
 * `jobs` rows that function as warehouse stand-ins rather than real job
 * sites — a tool sitting at any of these needs no site-to-site pickup stop
 * before a delivery. This is the same constant `docs/phase-3d-warehouse-offload.md`
 * anticipated as `WAREHOUSE_JOB_NAMES` for the (still unbuilt) return-to-warehouse
 * slice; reuse this one there instead of inventing a second list.
 */
export const WAREHOUSE_LOCATIONS = ["Warehouse", "1407 Locker", "Other - Not a Job Site"] as const

/**
 * Whether a tool's current `location` counts as "at the warehouse" rather
 * than "out on a job site." Blank/`NO_LOCATION` stays lenient — same "not
 * enough signal to say otherwise" treatment `isAssignable`/`isReadyForDispatch`
 * already give an unset value — so it never spuriously produces a pickup stop.
 */
export function isWarehouseLocation(location: string): boolean {
  const trimmed = location.trim()
  return trimmed === "" || trimmed === NO_LOCATION || (WAREHOUSE_LOCATIONS as readonly string[]).includes(trimmed)
}
