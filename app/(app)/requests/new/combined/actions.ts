"use server"

import { revalidatePath } from "next/cache"

import { requireSession } from "@/lib/auth/session"
import { newYorkInstant } from "@/lib/bubble/dates"
import { listJobs } from "@/lib/bubble/reference"
import { createPickupToolRequest, createToolRequest, type CreatedRequest } from "@/lib/bubble/requests"
import type { Job } from "@/lib/bubble/reference-types"
import { materialLinesWarning, resolveMaterialLines } from "@/lib/bubble/requested-materials"
import type { ResolvedMaterialLine } from "@/lib/bubble/requested-materials-types"
import { buildSummary } from "@/lib/notify"
import {
  combinedRequestFormSchema,
  toDeliveryValues,
  toPickupValues,
  type CombinedRequestFormValues,
} from "@/lib/schemas/combined-request"
import { pickupRequestFormSchema } from "@/lib/schemas/pickup-request"
import { requestFormSchema } from "@/lib/schemas/request"
import type { CombinedHalf, CombinedRequestState } from "./action-state"

/**
 * Two requests from one form, by **two calls to the two workflows that already
 * exist** — `new-pickup-request` then `new-request`. No third Bubble workflow,
 * deliberately: there is no combined row to create, and each half is exactly
 * the request the single-purpose page would have written.
 *
 * Consequences of that, all of them accepted rather than worked around:
 *
 * - **Two WhatsApp messages go out**, one per workflow. Each is the summary the
 *   corresponding single-purpose page would have sent.
 * - **No transaction, and the two calls overlap.** They are fired together and
 *   awaited with `allSettled`, because a submit was costing the sum of two ~5s
 *   Bubble round trips rather than the longer of them. That means four
 *   outcomes, not three: both, pickup only, delivery only, neither. Whichever
 *   one lands alone is reported as `partial` and left standing — deleting it to
 *   "undo" would not unsend its WhatsApp message, unstamp `jobs.lastRequest`,
 *   or remove its `notifications`, ClickUp and Calendar entries.
 *
 *   **`delivery only` is the outcome to watch**: a delivery request reads as
 *   complete on its own, gets dispatched, and nothing about it says a pickup
 *   was meant to happen. That is why the form reports the failed half by name
 *   and stays filled rather than navigating away.
 * - **The two rows are not linked to each other.** Bubble has no field for it
 *   and this repo may not add one (see `CLAUDE.md`); they share a job, a date
 *   and a slot, and that is all that ties them together.
 */
export async function createCombinedRequestAction(input: unknown): Promise<CombinedRequestState> {
  // Same auth boundary as the other two create actions: a server action is
  // reachable by direct POST, so the browser's validation counts for nothing.
  await requireSession()

  const parsed = combinedRequestFormSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form")
      fieldErrors[key] ??= issue.message
    }
    return { status: "invalid", message: "Some fields need fixing.", fieldErrors }
  }

  const values = parsed.data

  const job = (await listJobs()).find((entry) => entry.id === values.jobId)
  if (!job) {
    return { status: "error", message: "That job no longer exists in Bubble." }
  }

  // Re-parsed through each half's own schema rather than trusted from the
  // projection: `toDeliveryValues`/`toPickupValues` are the only place the two
  // shapes are built by hand, so this is what catches a field that drifts on
  // either side. The combined schema's refines are stricter than both, so a
  // failure here is a bug in the projection, not bad input — hence a flat error
  // rather than field-level messages the form has no field to attach to.
  const delivery = requestFormSchema.safeParse(toDeliveryValues(values))
  const pickup = pickupRequestFormSchema.safeParse(toPickupValues(values))
  if (!delivery.success || !pickup.success) {
    return { status: "error", message: "The combined form produced an invalid request. Reload and try again." }
  }

  // Before either workflow fires, so a bad catalogue line can't leave the
  // pickup half written on its own.
  const resolved = await resolveMaterialLines(delivery.data.materialLines)
  if (!resolved.ok) return { status: "error", message: resolved.message }

  // Fired together, not in sequence. Each workflow spends most of its time
  // inside Bubble waiting on Whapi, ClickUp and Outlook Calendar in turn, so
  // sequencing them made a submit cost the sum of two ~5s round trips for no
  // benefit the user could see. Overlapping them costs the longer of the two.
  //
  // `allSettled`, never `Promise.all`: `all` rejects on the first failure while
  // the other call is still in flight, and an HTTP request Bubble is already
  // processing cannot be cancelled — so it would report a failure and then
  // create the row anyway, seconds later. `allSettled` waits for both and lets
  // all four outcomes be reported truthfully.
  const started = Date.now()
  const [pickupResult, deliveryResult] = await Promise.allSettled([
    createPickupToolRequest(pickup.data, job, summaryFor(values, job, "pickup")),
    createToolRequest(delivery.data, job, summaryFor(values, job, "delivery", resolved.lines), resolved.lines),
  ])
  console.info(`[combined-request] both workflows settled in ${Date.now() - started}ms`)

  if (pickupResult.status === "rejected" && deliveryResult.status === "rejected") {
    return { status: "error", message: `Bubble rejected both requests: ${reason(pickupResult.reason)}` }
  }

  revalidatePath("/requests")

  // One succeeded and one didn't. Nothing is rolled back — the workflow that
  // got through also stamped `jobs.lastRequest`, wrote a `notifications` row
  // and fired ClickUp/Calendar/WhatsApp, none of which a `DELETE` undoes.
  if (deliveryResult.status === "rejected") {
    return partial("pickup", pickupResult as Fulfilled, "delivery", deliveryResult.reason)
  }
  if (pickupResult.status === "rejected") {
    return partial("delivery", deliveryResult as Fulfilled, "pickup", pickupResult.reason)
  }

  return {
    status: "created",
    pickupRequestId: pickupResult.value.requestId,
    deliveryRequestId: deliveryResult.value.requestId,
    job: job.name,
    warning: await materialLinesWarning(deliveryResult.value.requestId, resolved.lines.length),
  }
}

type Fulfilled = PromiseFulfilledResult<CreatedRequest>

function partial(
  created: CombinedHalf,
  result: Fulfilled,
  failed: CombinedHalf,
  error: unknown
): CombinedRequestState {
  return {
    status: "partial",
    created,
    requestId: result.value.requestId,
    job: result.value.job,
    message: `The ${created} request was created, but the ${failed} request failed: ${reason(error)}`,
  }
}

/**
 * One WhatsApp summary per half, each built the way its own page builds it —
 * the pickup's names the physical tools and its own materials, the delivery's
 * the tool types and theirs. The date is the same instant on both, since the
 * page asks for one date and one slot.
 */
function summaryFor(
  values: CombinedRequestFormValues,
  job: Job,
  half: "pickup" | "delivery",
  materialLines: readonly ResolvedMaterialLine[] = []
): string {
  const instant = newYorkInstant(values.date).toISOString()
  const isPickup = half === "pickup"

  return buildSummary({
    requestedBy: values.fieldPm,
    job: job.name,
    jobDetails: job.description,
    gc: job.gc,
    toDo: values.toDo,
    weAre: values.weAre,
    delivery: !isPickup,
    pickup: isPickup,
    floor: values.floor,
    contact: values.contact,
    contactPhone: values.contactPhone,
    fieldPm: values.fieldPm,
    start: instant,
    end: instant,
    timeRange: values.timeRange,
    notes: values.notes,
    tools: isPickup ? values.pickupTools : values.deliveryTools,
    toolsNotes: isPickup ? values.pickupToolsNotes : values.deliveryToolsNotes,
    materials: isPickup ? values.pickupMaterials : values.deliveryMaterials,
    materialLines,
  })
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "Bubble rejected the request."
}
