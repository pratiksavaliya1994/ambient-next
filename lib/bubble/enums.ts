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
 * `tools.status`, hardcoded per the user rather than read off live data (the
 * live app only ever had `"Ok"` / `"Missing"` / `"To be Repaired"` rows so
 * far — this is the full set the Pickup tool picker offers going forward).
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
