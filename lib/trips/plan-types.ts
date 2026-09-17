/**
 * The vocabulary a trip is planned in, before any of it reaches Bubble.
 *
 * Pure and client-safe — the trip builder computes a plan in the browser on
 * every tick, and the server action re-derives and validates the same shapes.
 * Same split as `lib/bubble/reference-types.ts` and
 * `lib/bubble/assigned-tools-types.ts`, for the same reason.
 *
 * The trip option sets live here rather than in `lib/bubble/enums.ts` because
 * that file was already at its 300-line cap; the seam is "trip vocabulary" vs
 * "request and location vocabulary".
 */

/**
 * `trip.status`. **Text in Bubble, not an option set** — the same call
 * `request.status` makes, so an unexpected value fails loudly in Zod here
 * rather than silently on a Bubble write.
 *
 * `Planned` is a draft: fully editable, reorderable, deletable, and it has
 * written **nothing** to `tools` or `request`. `Start trip` is the moment
 * inventory actually moves, and it is one-way — `cancel-trip` refuses anything
 * past `Planned`, because a trip that left the yard happened.
 */
export const TRIP_STATUS = ["Planned", "In Transit", "Completed", "Cancelled"] as const
export type TripStatus = (typeof TRIP_STATUS)[number]

export const DEFAULT_TRIP_STATUS: TripStatus = "Planned"

/** A trip still worth showing on the board, and still holding a claim on its tools. */
export function isOpenTrip(status: TripStatus): boolean {
  return status === "Planned" || status === "In Transit"
}

/**
 * `triptool.state` — where one tool has got to on this trip.
 *
 * **Both halves of a stop can fail, and they fail differently.**
 *
 * > **`Skipped` means the *collect* failed.** The driver reached the stop and
 * > couldn't take the tool: it stays exactly where it is, flagged
 * > `Pickup Requested`, with its `location` and `currentUser` untouched.
 *
 * > **`Refused` means the *drop* failed** — the site turned the tool away. The
 * > opposite situation: the tool is in the van and nothing about it has
 * > changed, so **no `tools` field is written at all**. It is still `In Transit`
 * > at `location = driver`, which is simply true. The row keeps its original
 * > `toStopKey`/`toLocation`, so it records for good *which site refused it* —
 * > the only copy of that fact, since there is one row per tool per trip.
 *
 * `Returned` closes a refusal: the tool was carried on to a warehouse stop and
 * unloaded there, `Available` and back in the yard. It is a separate value from
 * `Dropped` because `stopWork` routes a refused row to the return stop rather
 * than to its own `toStopKey` — read as `Dropped`, the row would drift back to
 * the site that refused it and wear a green "Done" chip on a delivery that
 * never happened.
 *
 * A tool still `Loaded` when a trip ends is simply still on the truck, which is
 * derivable (`isOnTruck`) rather than a state of its own.
 */
export const TRIP_TOOL_STATE = ["Planned", "Loaded", "Dropped", "Skipped", "Refused", "Returned"] as const
export type TripToolState = (typeof TRIP_TOOL_STATE)[number]

export const DEFAULT_TRIP_TOOL_STATE: TripToolState = "Planned"

/**
 * Whether this row still holds a claim on its tool, blocking another trip from
 * taking it. A `Dropped` tool has arrived and is free again; a `Skipped` one
 * was never collected and is equally free for someone else to try; a `Returned`
 * one is back in the yard.
 *
 * `Refused` **does** hold the claim: the tool is physically in this trip's van
 * until the driver unloads it at the yard, whatever the site thought of it.
 */
export function isLiveClaim(state: TripToolState): boolean {
  return state === "Planned" || state === "Loaded" || state === "Refused"
}

/**
 * Whether the tool is in the van right now — the question the finish-trip guard
 * asks, and the reason it is a function rather than two literal comparisons
 * repeated at each call site.
 *
 * `Refused` counts. Miss it and a driver can close a trip with a tool still
 * aboard, and nothing on screen can ever take it off again.
 */
export function isOnTruck(state: TripToolState): boolean {
  return state === "Loaded" || state === "Refused"
}

/**
 * What a trip decided about a tool that still has to be said **after the trip**
 * — on the request page, the dispatch board, anywhere the next move is planned.
 *
 * - `skipped` — a driver reached the tool and couldn't take it. It never left.
 * - `refused` — a site turned the delivery away. The tool came back instead.
 *
 * Every other state maps to `null`, and that is what makes the flag clear
 * itself: putting the tool on a fresh trip writes a `Planned` row, which
 * `listTripFlags` reads as the newest and reports as nothing to say.
 *
 * **`Returned` flags the same as `Refused`, deliberately.** The refusal is the
 * fact worth surfacing, and the moment it would otherwise vanish is exactly
 * when the tool lands back in the yard reading an entirely ordinary
 * `Available` — which is when a PM would send it straight back to the site
 * that just turned it away.
 */
export type TripFlag = "skipped" | "refused"

export function tripFlagOf(state: TripToolState): TripFlag | null {
  if (state === "Skipped") return "skipped"
  if (state === "Refused" || state === "Returned") return "refused"
  return null
}

/**
 * What kind of place a stop is — and therefore **what a drop there means**:
 *
 * | `kind`      | a dropped tool becomes | `location` written |
 * | ----------- | ---------------------- | ------------------ |
 * | `Job`       | `Delivered`            | the job's `name`   |
 * | `Warehouse` | `Available`            | the warehouse name |
 *
 * That one rule covers deliveries and pickups alike, with no per-tool
 * branching: a tool back in the yard is free again, which is what `Available`
 * has always meant.
 *
 * **Stored on the row, never re-derived.** `WAREHOUSE_JOB_NAMES` is a code
 * constant that will grow, and a trip planned against today's list must not
 * silently reclassify its own stops — and so its own write semantics — when a
 * name is added tomorrow. Same "stored at plan time" reasoning as
 * `assignedtools.toolType`.
 */
export const STOP_KIND = ["Warehouse", "Job"] as const
export type StopKind = (typeof STOP_KIND)[number]

/**
 * One tool's whole journey on this trip, before it has been given stops.
 *
 * `from` is the tool's live `tools.location`. `to` is the request's `job` for a
 * delivery, or the chosen warehouse for a pickup — **the only place the two
 * directions differ**, and it is resolved before planning begins, which is why
 * everything downstream can stay direction-agnostic.
 */
export type Movement = {
  toolId: string
  toolName: string
  /** The `assignedtools.toolType` label, carried through so the run sheet groups without a `toolstype` read. */
  toolType: string
  requestId: string
  from: string
  to: string
}

/** One stop on a planned route. `stopKey` is client-generated and stable; `seq` is what a drag rewrites. */
export type PlannedStop = {
  stopKey: string
  seq: number
  location: string
  kind: StopKind
}

/**
 * A movement with its two stops resolved.
 *
 * `fromLocation`/`toLocation` duplicate what the stops already say, on purpose:
 * they are the repair path. A row whose `stopKey`s stop resolving — a stop
 * deleted, a half-landed save — is otherwise unreadable, and with the two
 * strings the stop list can be rebuilt from the items alone.
 */
export type PlannedItem = Movement & {
  fromStopKey: string
  fromLocation: string
  toStopKey: string
  toLocation: string
}

/**
 * A record of one cycle `planTrip` had to break by splitting a node into a
 * collect half and a drop half — and which other locations could have been
 * split instead.
 *
 * `key` identifies the cycle itself (every candidate location, sorted and
 * joined), not the choice made, so it stays stable across replans of the same
 * selection regardless of which side gets picked. That is what lets a
 * dispatcher's "split here instead" choice survive a fresh `planTrip` call.
 */
export type SplitChoice = {
  key: string
  candidates: string[]
  chosen: string
}

export type TripPlan = {
  stops: PlannedStop[]
  items: PlannedItem[]
  /** Movements whose origin already equals their destination — the tool is already there, so there is nothing to drive. */
  noop: Movement[]
  /** Every cycle this plan resolved by splitting a node, and what else it could have split instead. */
  splitChoices: SplitChoice[]
}
