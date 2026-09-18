/**
 * The `tools` lifecycle vocabulary — `statusNew`, `condition`, and the three
 * predicates that gate every screen offering a tool.
 *
 * Split out of `lib/bubble/enums.ts` in phase 4, which grew the request
 * lifecycle to seven values and would otherwise have pushed that file past the
 * 300-line cap. The seam is tool vocabulary vs request/location vocabulary;
 * `isWarehouseLocation` deliberately stayed behind, since a location string is
 * matched against `jobs.name` and belongs with the request side.
 *
 * Bubble option sets are matched by display text on write, so mirroring them as
 * string-literal unions turns a typo into a compile error rather than a silent
 * no-op.
 */

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
 * **Phase 3A split condition off this field** into `tools.condition` /
 * `ToolCondition` below. The five condition values (`Maintenance Required`
 * through `Missing`) stay in this option set — an old-Bubble-UI edit could
 * still write one — but this app no longer writes them here; it writes
 * `condition` instead. `isAssignable` checks both fields for exactly that
 * reason.
 *
 * **Phase 4 did not change these values**, only who writes them: the trip
 * workflows (`start-trip`, `complete-trip-stop`) took over from
 * `update-request-status`. `Available` now also means "back at the warehouse
 * and free again" — what a `Warehouse`-kind drop writes — which is the same
 * thing it always meant, reached by a new route.
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
 * `TOOL_STATUS_AVAILABLE` is the ordinary "free" state — the candidate queries
 * (`listCandidateTools`/`searchTools`) filter to it, alongside
 * `TOOL_STATUS_PICKUP_REQUESTED`; see `isFreeToAssign` for why both count. It
 * is also what a drop at a `Warehouse`-kind trip stop writes, which is how a
 * pickup request's tools re-enter circulation.
 * `TOOL_STATUS_ASSIGNED` is written the moment a tool is committed to a request
 * (`assignToolsAction`) and reverted to `Available` on Unassign.
 * `TOOL_STATUS_IN_TRANSIT` is written by `start-trip` and by a collect at a
 * trip stop; `TOOL_STATUS_DELIVERED` by a drop at a `Job`-kind stop.
 *
 * `TOOL_STATUS_PICKUP_REQUESTED` means one specific thing and is worth keeping
 * that way: **somebody wants this tool collected and it hasn't been.** Two
 * writers produce it — a pickup request naming the tool at creation, and a
 * driver reaching a collect stop and *not* being able to take it. Neither moves
 * the tool, so its `location` stays the site it is actually sitting on. It is
 * deliberately absent from `UNASSIGNABLE_TOOL_STATUS` — nothing is wrong with
 * the tool — and deliberately *not* silently reverted to `Available`, so it
 * stays visibly distinguishable while remaining just as offerable for a future
 * request; see `isFreeToAssign`.
 */
export const TOOL_STATUS_AVAILABLE: ToolStatusNew = "Available"
export const TOOL_STATUS_ASSIGNED: ToolStatusNew = "Assigned"
export const TOOL_STATUS_IN_TRANSIT: ToolStatusNew = "In Transit"
export const TOOL_STATUS_DELIVERED: ToolStatusNew = "Delivered"
export const TOOL_STATUS_PICKUP_REQUESTED: ToolStatusNew = "Pickup Requested"

/**
 * The `statusNew` values worth filtering the Tools dashboard by — the actual
 * lifecycle states, excluding `Available` (the default/idle state, not
 * interesting to filter to) and the five condition-flavoured values
 * (`Maintenance Required` … `Missing`), which moved to `tools.condition` in
 * phase 3A and stay in `TOOL_STATUS_NEW` only for backward compatibility with
 * rows an old-Bubble-UI edit could still write there.
 */
export const TOOL_STATUS_LIFECYCLE_FILTER: readonly ToolStatusNew[] = [
  TOOL_STATUS_AVAILABLE,
  TOOL_STATUS_ASSIGNED,
  TOOL_STATUS_IN_TRANSIT,
  TOOL_STATUS_DELIVERED,
  TOOL_STATUS_PICKUP_REQUESTED,
]

/**
 * A tool whose `statusNew` reads one of these is never offered for assignment,
 * regardless of `isFreeToAssign` — this is the condition-based exclusion,
 * orthogonal to the flow-state one.
 *
 * **This is read from `statusNew` only**, and that field is now backfilled on
 * every live row, so the filter really does hide broken tools — a row whose
 * old `status` said `To be Repaired` reads `Repair Required` here and drops
 * out of the candidate lists.
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
 * `statusNew` with flow values (`In Transit`, `Delivered`, …). Most display
 * texts are shared with `TOOL_STATUS_NEW` on purpose — same words, so the
 * Bubble backfill is a copy rather than a translation, and nothing in the UI
 * changes vocabulary on the user. `Ok` is new: its `statusNew` counterpart was
 * `Available`, which is a *flow* state, not a condition. `Retired` has no
 * `statusNew` counterpart at all — it's a condition-only value added later.
 * `Repair Required` was dropped as a duplicate of `Maintenance Required`;
 * `TOOL_STATUS_NEW`/`UNASSIGNABLE_TOOL_STATUS` still carry it as a legacy
 * value an old-Bubble-UI edit could still write.
 *
 * **Nothing in the trip flow writes this field**, which is the whole payoff of
 * the 3A split: a tool collected on a pickup and dropped at the warehouse
 * arrives with the condition the PM recorded when they asked for it.
 */
export const TOOL_CONDITION = [
  "Ok",
  "Maintenance Required",
  "Under Repair",
  "Inspection Required",
  "Missing",
  "Retired",
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
 * Whether a tool is genuinely free to be picked for a *new* request right now
 * — the flow-state half of "offerable," alongside `isAssignable`'s
 * condition-state half; a caller populating a picker checks both.
 *
 * `Available` is the ordinary case. `Pickup Requested` also counts: neither
 * writer of that value moves the tool or reverts it (see `TOOL_STATUS_NEW`), so
 * treating it as *not* free would silently make every tool anyone has asked to
 * collect unassignable — the opposite of what those features decided. Blank
 * stays lenient, same reasoning as `isAssignable`/`isReadyForDispatch`.
 * `Assigned`, `In Transit` and `Delivered` are the only true holds: some
 * request already has a live claim.
 */
export function isFreeToAssign(statusNew: string): boolean {
  return statusNew === "" || statusNew === TOOL_STATUS_AVAILABLE || statusNew === TOOL_STATUS_PICKUP_REQUESTED
}

/**
 * Whether an already-*assigned* tool is actually fit to leave its current
 * location on a trip. `Assigned` is the expected value for a delivery — every
 * tool that made it through the picker was `Available` and got flipped by this
 * same request's own assign step. `Available` is also accepted, for tools
 * backfilled or edited outside the app, and for a tool sitting free on a job
 * site that a site-to-site leg is collecting.
 *
 * `Pickup Requested` is **not** accepted here, and that is deliberate even
 * though a pickup request's tools all carry it: a trip's collect step is gated
 * on the `triptool` row, not on this predicate. This one answers the narrower
 * question "could this tool be *added* to a trip's delivery leg", where
 * `Pickup Requested` means someone else's collect is already outstanding.
 *
 * Blank stays ready, same leniency as `isAssignable`: after the backfill an
 * empty `statusNew` is a migration gap, not a signal the tool is unavailable.
 */
export function isReadyForDispatch(statusNew: string): boolean {
  return statusNew === "" || statusNew === TOOL_STATUS_AVAILABLE || statusNew === TOOL_STATUS_ASSIGNED
}

/**
 * Whether a tool has physically left the yard on this or any trip — on a truck,
 * or already dropped somewhere. Such a tool is **not** an assign screen's to
 * take back: removing it would delete the only record that it went out, and
 * (before phase 4) reset a tool sitting on a job site to `Available`.
 *
 * Read off the tool's own live `statusNew` rather than off a `triptool` row:
 * the two agree — a trip is what writes these values — and this way the guard
 * also holds for the handful of requests dispatched under the pre-trip flow.
 *
 * The reason it exists at all is that assigning is open for the whole life of a
 * request, not just before dispatch: a request that went out short can have its
 * missing tools filled in later, which means the assign screen now routinely
 * renders tools it must refuse to unpick.
 */
export function isLockedToTrip(statusNew: string): boolean {
  return statusNew === TOOL_STATUS_IN_TRANSIT || statusNew === TOOL_STATUS_DELIVERED
}
