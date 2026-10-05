"use server"

import { revalidatePath } from "next/cache"

import { requireSession } from "@/lib/auth/session"
import { newYorkInstant } from "@/lib/bubble/dates"
import { listJobs } from "@/lib/bubble/reference"
import { cancelTrip, createTrip, saveTrip, type TripHeaderInput } from "@/lib/bubble/trips"
import { getTrip, listToolClaims } from "@/lib/bubble/trips-read"
import { invalidMaterialMessage, selectMaterialMovements } from "@/lib/trips/material-movement-types"
import { withManualStops } from "@/lib/trips/manual-stops"
import { listOutstandingMovements } from "@/lib/trips/movements"
import { selectMovements } from "@/lib/trips/movement-types"
import { planTrip, resequence } from "@/lib/trips/plan"
import { minutesOfTime } from "@/lib/trips/schedule"
import { PLAN_STILL_LANDING, waitForTripPlan } from "@/lib/trips/settle"
import type { PlannedItem, PlannedMaterial, PlannedStop } from "@/lib/trips/plan-types"
import { validatePlan } from "@/lib/trips/validate"
import { cancelTripSchema, createTripSchema, saveTripSchema } from "@/lib/schemas/trip"
import type { TripDraftState } from "@/app/(app)/trips/action-state"

/**
 * Saving a trip draft — create and replace.
 *
 * **A draft writes nothing to `tools` or `request`.** That is the point of it
 * existing: a warehouse manager plans tomorrow's routes, drags the stops about,
 * and nothing physical has happened until someone presses Start trip.
 *
 * Both actions re-derive the plan from a fresh read of the movement pool rather
 * than trusting the client's items — the same "don't trust the client's copy"
 * call every write in this app makes. What the client *is* believed about is
 * the two things only it knows: which tools were ticked, and what order the
 * stops were dragged into.
 */

function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form")
    fieldErrors[key] ??= issue.message
  }
  return fieldErrors
}

/**
 * Re-plans from live data and reconciles the result against the order the
 * dispatcher dragged.
 *
 * The seed order from `planTrip` is discarded when the client sends its own —
 * the drag is a deliberate choice and silently re-planning over it would save a
 * route nobody chose. What is **not** taken from the client is the stop/tool
 * pairing: that is recomputed, so a stale tab can't attach a tool to a stop
 * that no longer makes sense.
 *
 * Material quantities are checked against a fresh read of what's outstanding
 * (the edited trip's own rows excluded), and one above it is refused by name.
 */
async function buildPlan(
  selection: {
    toolIds: readonly string[]
    destinations: readonly { requestId: string; warehouse: string }[]
    materials: readonly { lineId: string; qty: number }[]
    stops: readonly PlannedStop[]
    /** The dispatcher's "split here instead" choices — see `splitChoiceSchema`. */
    splitPreference: readonly { key: string; chosen: string }[]
    /** Job names added as stops by hand — see `withManualStops`. */
    manualStops: readonly string[]
  },
  /** The trip being saved, when editing — its own claims aren't a block on itself. */
  excludeTripId?: string
): Promise<{ stops: PlannedStop[]; items: PlannedItem[]; materials: PlannedMaterial[] } | { error: string }> {
  const { toolIds, destinations, stops: clientStops, splitPreference } = selection
  const groups = await listOutstandingMovements(excludeTripId)
  const wanted = new Set(toolIds)
  const destinationByRequest = new Map(destinations.map((entry) => [entry.requestId, entry.warehouse]))

  const picked = selectMaterialMovements(
    groups,
    new Map(selection.materials.map((line) => [line.lineId, line.qty])),
    destinationByRequest
  )
  if (picked.invalid.length > 0) return { error: invalidMaterialMessage(picked.invalid) }

  const { movements, blocked } = selectMovements(groups, wanted, destinationByRequest)

  if (blocked.length > 0) {
    const [first] = blocked
    const reason =
      first.block?.kind === "claimed"
        ? `${first.toolName} is already on ${first.block.driver ?? "another"}'s trip`
        : `${first.toolName} isn't available (${first.block?.detail ?? "unknown"})`
    return {
      error:
        blocked.length === 1
          ? `${reason}. Reload the builder.`
          : `${blocked.length} of these tools are no longer available — ${reason}. Reload the builder.`,
    }
  }

  const found = new Set(movements.map((movement) => movement.toolId))
  const missing = [...wanted].filter((id) => !found.has(id))
  if (missing.length > 0) {
    return {
      error: `${missing.length} of the picked tools have already been moved or delivered. Reload the builder.`,
    }
  }

  // A manual stop has to be a job on file — the builder only offers those, and
  // a direct POST is held to the same list.
  if (selection.manualStops.length > 0) {
    const jobNames = new Set((await listJobs()).map((job) => job.name))
    const unknown = selection.manualStops.find((name) => !jobNames.has(name))
    if (unknown) return { error: `${unknown} isn't a job on file. Reload the builder.` }
  }

  const plan = withManualStops(
    planTrip(
      movements,
      { splitPreference: new Map(splitPreference.map((choice) => [choice.key, choice.chosen])) },
      picked.materials
    ),
    selection.manualStops
  )

  // Reconcile the dispatcher's order onto the freshly-planned stops, matching on
  // `stopKey`. A stop the re-plan no longer produces is dropped; one it produced
  // that the client never saw goes to the end, where the order check below will
  // flag it if that is actually wrong.
  const position = new Map(clientStops.map((stop, index) => [stop.stopKey, index]))
  const ordered = [...plan.stops].sort(
    (a, b) => (position.get(a.stopKey) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.stopKey) ?? Number.MAX_SAFE_INTEGER) || a.seq - b.seq
  )

  const stops = resequence(ordered)
  const problems = validatePlan(stops, plan.items, plan.materials)
  if (problems.length > 0) {
    return { error: problems[0].message }
  }

  return { stops, items: plan.items, materials: plan.materials }
}

function headerOf(values: { driver: string; tripDate: string; startTime: string; notes: string }): TripHeaderInput {
  const startMinutes = minutesOfTime(values.startTime)
  return {
    driver: values.driver.trim(),
    // The day *and* the departure time collapse into the one date field Bubble
    // has. Written as a real New York instant rather than midnight, because the
    // stop times every trip screen renders are counted forward from it — a
    // midnight value would put the first stop at 12 AM.
    tripDate: newYorkInstant(values.tripDate, Math.floor(startMinutes / 60), startMinutes % 60).toISOString(),
    notes: values.notes,
  }
}

export async function createTripAction(input: unknown): Promise<TripDraftState> {
  await requireSession()

  const parsed = createTripSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "invalid", message: "That trip isn't valid.", fieldErrors: fieldErrorsOf(parsed.error) }
  }

  const plan = await buildPlan(parsed.data)
  if ("error" in plan) return { status: "error", message: plan.error }

  let tripId: string
  try {
    ;({ tripId } = await createTrip(parsed.data.idempotencyKey, headerOf(parsed.data), plan.stops, plan.items, plan.materials))
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the trip: ${error.message}` : "Bubble rejected the trip.",
    }
  }

  // The stop and tool rows are created by an async fan-out, so the workflow
  // returning does not mean they exist yet. Wait for them, or the run sheet the
  // browser is about to open renders a half-written plan. See `waitForTripPlan`.
  const settled = await waitForTripPlan(tripId, plan.stops, plan.items, plan.materials)

  revalidatePath("/trips")
  revalidatePath("/trips/new")

  return {
    status: "saved",
    tripId,
    stops: plan.stops.length,
    tools: plan.items.length,
    materials: plan.materials.length,
    warning: settled ? undefined : PLAN_STILL_LANDING,
  }
}

export async function saveTripAction(input: unknown): Promise<TripDraftState> {
  await requireSession()

  const parsed = saveTripSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "invalid", message: "That trip isn't valid.", fieldErrors: fieldErrorsOf(parsed.error) }
  }

  const { tripId, toolIds } = parsed.data

  // `save-trip` refuses a started trip on the Bubble side too — that guard is
  // the real one, since `/wf/` endpoints are reachable directly. This check
  // exists so the dispatcher gets a sentence instead of a workflow error.
  const existing = await getTrip(tripId)
  if (!existing) return { status: "error", message: "That trip no longer exists." }
  if (existing.status !== "Planned") {
    return { status: "error", message: `This trip is already ${existing.status} and can't be edited. Reload the page.` }
  }

  // A tool already on *this* draft is not a new claim, so only genuinely new
  // picks are re-checked — the same diff `assignToolsAction` does.
  const alreadyOnTrip = new Set(existing.items.map((item) => item.toolId))
  const newlyPicked = toolIds.filter((id) => !alreadyOnTrip.has(id))
  if (newlyPicked.length > 0) {
    const claims = await listToolClaims(newlyPicked)
    for (const [toolId, trip] of claims) {
      if (trip.id === tripId) continue
      const name = existing.items.find((item) => item.toolId === toolId)?.toolName ?? "A tool"
      return {
        status: "error",
        message: `${name} was just added to ${trip.driver ?? "another"}'s trip. Reload the builder.`,
      }
    }
  }

  const plan = await buildPlan(parsed.data, tripId)
  if ("error" in plan) return { status: "error", message: plan.error }

  try {
    await saveTrip(tripId, headerOf(parsed.data), plan.stops, plan.items, plan.materials)
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? `Bubble rejected the change: ${error.message}` : "Bubble rejected the change.",
    }
  }

  // Same async fan-out as `createTripAction`, and a save feels it harder: step 3
  // and 4 of `save-trip` delete the old rows outright, so until the new ones
  // land the trip genuinely has fewer stops than it did before the edit.
  const settled = await waitForTripPlan(tripId, plan.stops, plan.items, plan.materials)

  revalidatePath("/trips")
  revalidatePath(`/trips/${tripId}`)
  revalidatePath(`/trips/${tripId}/edit`)

  return {
    status: "saved",
    tripId,
    stops: plan.stops.length,
    tools: plan.items.length,
    materials: plan.materials.length,
    warning: settled ? undefined : PLAN_STILL_LANDING,
  }
}

/** Deletes a draft. Refuses anything past `Planned` — on this side and in Bubble. */
export async function cancelTripAction(input: unknown): Promise<TripDraftState> {
  await requireSession()

  const parsed = cancelTripSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "invalid", message: "That isn't a valid trip.", fieldErrors: fieldErrorsOf(parsed.error) }
  }

  try {
    await cancelTrip(parsed.data.tripId)
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Bubble rejected the cancellation.",
    }
  }

  revalidatePath("/trips")
  return { status: "saved", tripId: parsed.data.tripId, stops: 0, tools: 0 }
}
