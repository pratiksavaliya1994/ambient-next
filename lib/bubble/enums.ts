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
 * `request.order` doubles as a driver's stop sequence on `/dispatch/active`.
 *
 * Positions are stored **offset above** `DEFAULT_REQUEST_ORDER` — stop 1 is
 * `101`, not `1` — so a sequenced row keeps sorting exactly where it already
 * does in the old Bubble UI's `order`-sorted calendar, a UI this repo doesn't
 * own. Plain `1..N` would have jumped every sequenced request to the top of it.
 * See `docs/bubble-set-request-order-spec.md` §7.
 */
export const STOP_ORDER_BASE = DEFAULT_REQUEST_ORDER

/** A trip never has 99 stops. This is also what keeps `isSequenced` a total test. */
export const MAX_STOP_ORDER = 99

/**
 * Whether this row has ever been sequenced. `100` (the create-time default),
 * `0` and absent all collapse to "no" — the entire legacy story for the ~1,550
 * rows that predate this, every one of which carries `100`.
 */
export function isSequenced(order: number): boolean {
  return Number.isInteger(order) && order > STOP_ORDER_BASE && order <= STOP_ORDER_BASE + MAX_STOP_ORDER
}

/** `101` → `1`. Only meaningful when `isSequenced(order)`. */
export function stopPosition(order: number): number {
  return order - STOP_ORDER_BASE
}

/**
 * `request.status` — the lifecycle. **Text in Bubble, not an option set** (see
 * `docs/phase-2-lifecycle.md`), so an unexpected value fails loudly in Zod here
 * rather than silently on a Bubble write. A row with no `status` reads as
 * `New`, which is what lets the ~1,550 existing rows stay untouched, and is
 * also why adding values in phase 4 cost nothing on the Bubble side.
 *
 * **Two terminal branches since phase 4**, which `docs/phase-3-pickup-lifecycle.md`
 * anticipated: a delivery ends `Delivered`, a pickup ends `Returned`. Each has
 * a partial twin, because a trip moves *tools*, not whole requests — a request
 * whose tools went out on two trips is genuinely half-finished between them,
 * and previously had nowhere to say so.
 *
 * The words shifted meaning in phase 4 and the new readings are the ones to
 * trust:
 *
 * - `In Transit` — at least one of this request's tools is on a truck.
 * - `Partially Delivered` / `Partially Returned` — at least one tool has landed
 *   **and** at least one is still outstanding. Still open; still assignable.
 * - `Delivered` / `Returned` — closed. `deriveRequestStatus` treats these as a
 *   ratchet, so nothing reopens a request by accident.
 */
export const REQUEST_STATUS = [
  "New",
  "Assigned",
  "In Transit",
  // Delivery branch.
  "Partially Delivered",
  "Delivered",
  // Pickup branch.
  "Partially Returned",
  "Returned",
] as const
export type RequestStatus = (typeof REQUEST_STATUS)[number]

export const DEFAULT_REQUEST_STATUS: RequestStatus = "New"

/**
 * What the detail page's stepper walks — **not** `REQUEST_STATUS`.
 *
 * The two were the same array until phase 4, and `statusIndex` was literally
 * `REQUEST_STATUS.indexOf(status)`. That stopped working the moment the union
 * grew: a partial is a *variant* of In Transit, not a step of its own, and the
 * two terminal values are alternatives rather than a sequence. Rendering the
 * union flat would show every request four steps it never passes through.
 */
export const DELIVERY_STEPS = ["New", "Assigned", "In Transit", "Delivered"] as const
export const PICKUP_STEPS = ["New", "Assigned", "In Transit", "Returned"] as const

/** Both partials share slot 2 with `In Transit`; both terminals share slot 3. */
const STEP_INDEX: Record<RequestStatus, number> = {
  New: 0,
  Assigned: 1,
  "In Transit": 2,
  "Partially Delivered": 2,
  Delivered: 3,
  "Partially Returned": 2,
  Returned: 3,
}

export function statusStepIndex(status: RequestStatus): number {
  return STEP_INDEX[status]
}

/**
 * Which branch a request is on.
 *
 * A row with **both** `delivery` and `pickup` true has two lifecycles and one
 * status field — a known limit carried since phase 3. The forms never create
 * one, so it stays latent; it reads as a delivery here rather than being
 * special-cased into a third branch.
 */
export function isPickupRequest(request: { delivery: boolean; pickup: boolean }): boolean {
  return request.pickup && !request.delivery
}

export function requestSteps(request: { delivery: boolean; pickup: boolean }): readonly RequestStatus[] {
  return isPickupRequest(request) ? PICKUP_STEPS : DELIVERY_STEPS
}

/**
 * Whether a request still has work outstanding — the test the trip builder's
 * movement pool filters on. Everything but the two terminal values is open,
 * including both partials: that is the entire point of them existing.
 */
export function isOpenRequest(status: RequestStatus): boolean {
  return status !== "Delivered" && status !== "Returned"
}

/**
 * The `tools` lifecycle vocabulary moved to `lib/bubble/tool-enums.ts` in phase
 * 4 — `TOOL_STATUS_NEW`, `TOOL_CONDITION`, `isAssignable`, `isFreeToAssign`,
 * `isReadyForDispatch` and the named write constants all live there now.
 * Import from that module directly; this file deliberately does not re-export
 * them, so there is one place to look rather than two.
 *
 * `WAREHOUSE_LOCATIONS`/`isWarehouseLocation` and `WAREHOUSE_JOB_NAMES` stayed
 * here: a `tools.location` value is matched against `jobs.name`, which makes it
 * request/job vocabulary rather than tool vocabulary.
 */

/**
 * `jobs` rows that function as warehouse stand-ins rather than real job sites —
 * a tool sitting at any of these needs no collect stop before a delivery.
 *
 * This is the **origin** question, and it is deliberately broader than
 * `WAREHOUSE_JOB_NAMES` below. `docs/phase-3d-warehouse-offload.md` suspected
 * the two lists would differ and asked for the call to be made from live data
 * rather than by accident; it does differ, and this is the wider one. "Other -
 * Not a Job Site" is plainly not a warehouse, but a tool sitting at one still
 * needs no special collect stop.
 */
export const WAREHOUSE_LOCATIONS = ["Warehouse", "1407 Locker", "Other - Not a Job Site"] as const

/**
 * Where a pickup can actually be **returned to** — the destinations the trip
 * builder offers, and the values that make a `tripstop` `Warehouse`-kind (which
 * is what decides a drop writes `Available` rather than `Delivered`).
 *
 * **Read off live rows on 2026-09-15**, the same provenance `WE_ARE` and
 * `TO_DO` carry, via `listToolLocations()` / `npm run check-bubble`: of 70
 * distinct `tools.location` values across 532 tools, exactly one is a
 * warehouse — `"Warehouse"`, on 229 of them. Neither `"1407 Locker"` nor
 * `"Other - Not a Job Site"` appears on a single tool, and there are **no
 * casing or trailing-whitespace variants** to defend against.
 *
 * The strings must match `jobs.name` byte for byte: `tools.location` is
 * compared with `equals` and nothing enforces referential integrity, so a
 * near-miss silently splits the Tools dashboard into two warehouse cards that
 * cannot find each other. `check-bubble` flags any value with no matching
 * `jobs` row, which is the standing guard against that drift.
 *
 * One entry is fine. A `Select` with a single option is still the right
 * control, because the next warehouse is a one-line change with no schema work.
 */
export const WAREHOUSE_JOB_NAMES = ["Warehouse"] as const
export type WarehouseName = (typeof WAREHOUSE_JOB_NAMES)[number]

export const DEFAULT_WAREHOUSE: WarehouseName = "Warehouse"

/** Whether a drop here returns a tool to circulation (`Available`) or lands it on a job (`Delivered`). */
export function isWarehouseDestination(location: string): boolean {
  return (WAREHOUSE_JOB_NAMES as readonly string[]).includes(location.trim())
}

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
