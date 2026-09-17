import { z } from "zod"

import { WAREHOUSE_JOB_NAMES } from "@/lib/bubble/enums"
import { STOP_KIND } from "@/lib/trips/plan-types"

/**
 * What the trip screens submit, validated in the client island **and** again in
 * the action — a server action is reachable by direct POST, so the browser's
 * validation is not a boundary. Same pair every other form here forms.
 *
 * The rule throughout: **the client sends choices, never derivations.** It
 * sends which tools were ticked and what order the stops were dragged into; the
 * server re-reads the pool, re-resolves each tool's origin, and re-numbers the
 * stops. A client-supplied `seq`, or a client-supplied "this tool is at the
 * warehouse", would be a stale copy of something the server can read fresh.
 */

/**
 * A stop as the builder holds it. `seq` is accepted but **not trusted** —
 * `resequence` renumbers from array order before the write, so a reordered
 * array is the truth and the number is a convenience.
 */
export const plannedStopSchema = z.object({
  stopKey: z.string().min(1),
  seq: z.number().int().min(1),
  location: z.string().min(1),
  kind: z.enum(STOP_KIND),
})

export const plannedItemSchema = z.object({
  toolId: z.string().min(1),
  toolName: z.string(),
  toolType: z.string(),
  requestId: z.string(),
  from: z.string(),
  to: z.string(),
  fromStopKey: z.string().min(1),
  fromLocation: z.string(),
  toStopKey: z.string().min(1),
  toLocation: z.string(),
})

/**
 * A pickup's destination is a real user choice, so it *is* taken from the
 * client — but only ever one of the known warehouse names.
 *
 * `z.enum`, not `z.string()`: a warehouse name outside the constant is exactly
 * the typo that would strand a returned load somewhere `listToolsForJob` can
 * never find it, and this is the last boundary where it can still fail loudly.
 */
export const destinationSchema = z.object({
  requestId: z.string().min(1),
  warehouse: z.enum(WAREHOUSE_JOB_NAMES),
})

/**
 * Which side of a circular pickup/drop cycle the dispatcher chose to visit
 * twice — a choice, same as `stops`' drag order, not a derivation. `key`
 * identifies the cycle (see `SplitChoice` in `plan-types.ts`); the server
 * re-plans from a fresh read and needs this to land on the same split rather
 * than silently falling back to the default tie-break.
 */
export const splitChoiceSchema = z.object({
  key: z.string().min(1),
  chosen: z.string().min(1),
})

const tripHeaderShape = {
  driver: z.string().trim().min(1, "Pick a driver."),
  /** `yyyy-mm-dd`, read as a New York calendar date — same convention as the request forms. */
  tripDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  /**
   * `HH:mm`, New York wall clock — when the driver leaves. Combined with
   * `tripDate` into the single instant `trip.tripDate` stores, and the thing
   * every stop's time window is counted forward from.
   *
   * A *choice*, so it is taken from the client — unlike the stop times
   * themselves, which are derived from this and a stop's position and are
   * therefore never sent at all.
   */
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a start time."),
  notes: z.string().trim().max(2000),
  toolIds: z.array(z.string().min(1)).min(1, "Pick at least one tool."),
  destinations: z.array(destinationSchema),
  stops: z.array(plannedStopSchema).min(1),
  items: z.array(plannedItemSchema).min(1),
  splitPreference: z.array(splitChoiceSchema).default([]),
}

/**
 * `idempotencyKey` is generated **once per draft**, not per attempt, and that
 * distinction is the whole point: `lib/bubble/client.ts` retries a POST four
 * times on 429/5xx, and `create-trip` has no delete-first step to absorb a
 * 502-after-commit. A key regenerated on retry would defeat the guard it
 * exists to provide.
 */
export const createTripSchema = z
  .object({ idempotencyKey: z.string().uuid(), ...tripHeaderShape })
  .refine((value) => new Set(value.toolIds).size === value.toolIds.length, {
    message: "The same tool can't be on a trip twice.",
    path: ["toolIds"],
  })

export const saveTripSchema = z
  .object({ tripId: z.string().min(1), ...tripHeaderShape })
  .refine((value) => new Set(value.toolIds).size === value.toolIds.length, {
    message: "The same tool can't be on a trip twice.",
    path: ["toolIds"],
  })

export type CreateTripValues = z.infer<typeof createTripSchema>
export type SaveTripValues = z.infer<typeof saveTripSchema>

/** No `toolIds`: the action derives the first stop's collect list from the trip's own rows. */
export const startTripSchema = z.object({ tripId: z.string().min(1) })

/**
 * One stop, four lists — and the action re-reads the stop to decide what a drop
 * there writes, rather than taking `dropStatus` from the client. The stop's
 * stored `kind` is the authority on that.
 *
 * **`returnToolIds` is deliberately absent.** Unloading a refused tool at the
 * yard is the same gesture as any other drop, so the client ticks it in
 * `dropToolIds`; the action splits the two apart by each row's live state. The
 * client sends choices, never derivations.
 */
export const completeStopSchema = z
  .object({
    tripId: z.string().min(1),
    stopKey: z.string().min(1),
    dropToolIds: z.array(z.string().min(1)),
    loadToolIds: z.array(z.string().min(1)),
    skipToolIds: z.array(z.string().min(1)),
    /** Drops the site turned away. The mirror of `skipToolIds` on the other half of a stop. */
    refuseToolIds: z.array(z.string().min(1)),
  })
  .refine(
    (value) =>
      value.dropToolIds.length +
        value.loadToolIds.length +
        value.skipToolIds.length +
        value.refuseToolIds.length >
      0,
    { message: "Nothing to record at this stop.", path: ["dropToolIds"] }
  )
  .refine(
    (value) => {
      const all = [
        ...value.dropToolIds,
        ...value.loadToolIds,
        ...value.skipToolIds,
        ...value.refuseToolIds,
      ]
      return new Set(all).size === all.length
    },
    { message: "A tool can only have one outcome at a stop.", path: ["skipToolIds"] }
  )

export const completeTripSchema = z.object({ tripId: z.string().min(1) })
export const cancelTripSchema = z.object({ tripId: z.string().min(1) })

/**
 * Closing a request by hand — the escape hatch for slots nobody will ever fill.
 *
 * Writes the terminal status and nothing else; `deriveRequestStatus` is a
 * ratchet, so nothing reopens it afterwards.
 */
export const closeRequestSchema = z.object({ requestId: z.string().min(1) })
