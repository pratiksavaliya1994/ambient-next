import { z } from "zod"

import { TO_DO, WE_ARE } from "@/lib/bubble/enums"
import { TOOL_CONDITION } from "@/lib/bubble/tool-enums"
import { materialLinesSchema } from "@/lib/schemas/material"
import { toolLineSchema, type RequestFormValues } from "@/lib/schemas/request"
import type { PickupRequestFormValues } from "@/lib/schemas/pickup-request"

/**
 * The combined Delivery + Pickup form — a **utility page, not a third kind of
 * request**. There is no `combined` row in Bubble and no new backend workflow:
 * on submit this projects into the two existing shapes and the action calls
 * `new-pickup-request` and `new-request` in turn, producing two ordinary,
 * independent `request` rows.
 *
 * Which is why every shared concept keeps the *same* field name it has in
 * `requestFormSchema` and `pickupRequestFormSchema` — `toDeliveryValues` and
 * `toPickupValues` below are then near-mechanical, and a field added to either
 * of those schemas fails to compile here rather than silently going unsent.
 *
 * Three fields are deliberately **not** shared, because the two halves are
 * about different physical objects:
 *
 * - tools — delivery picks `toolstype` *types with quantities*, pickup picks
 *   individual `tools` rows already on the job. Two pickers, two lists.
 * - materials — what a crew wants brought to site is not what they want taken
 *   off it, so each half carries its own free text and its own
 *   `requestedmaterials` row.
 * - tool notes — likewise, the warehouse instruction for an outbound load is
 *   not the one for an inbound load.
 *
 * Everything else (job, job type, date, slot, floor, contact, PM, notes) is
 * entered once and copied to both, which is the entire point of the page.
 */

const dayString = /^\d{4}-\d{2}-\d{2}$/

export const combinedRequestFormSchema = z
  .object({
    jobId: z.string().min(1, "Pick a job."),
    toDo: z.enum(TO_DO),
    weAre: z.enum(WE_ARE),
    /**
     * `yyyy-mm-dd`, read as a New York calendar date. **One date for both
     * halves** — the delivery's range collapses to this single day, so
     * `createToolRequest`'s same-day branch gives it a 30-minute
     * `requestDateEnd` exactly as a pickup gets.
     */
    date: z.string().regex(dayString, "Pick a date."),
    timeRange: z.string().trim().max(120),
    slotHour: z.number().int().min(0).max(23),
    floor: z.string().trim().max(120),
    contact: z.string().trim().max(120),
    contactPhone: z.string().trim().max(40),
    fieldPm: z.string().trim().max(120),
    notes: z.string().trim().max(2000),
    tentative: z.boolean(),
    /** Pickup-only, same as `pickupRequestFormSchema` — no Bubble field, folded into `notes` on write. */
    cleanup: z.boolean(),

    /** Tool *types* with quantities, from the `toolstype` catalogue. */
    deliveryTools: z.array(toolLineSchema),
    deliveryToolsNotes: z.string().trim().max(2000),
    deliveryMaterials: z.string().trim().max(2000),
    /** Phase 5 structured lines, delivery half only — the pickup half stays free text until 5G. */
    deliveryMaterialLines: materialLinesSchema,

    /** Individual physical `tools` rows currently at the job. */
    pickupTools: z.array(toolLineSchema),
    /** The same tools by id — one `assignedtools` row apiece. See `toolIdsOfPickup`. */
    pickupToolIds: z.array(z.string().min(1)),
    pickupToolConditionUpdates: z.array(z.object({ toolId: z.string(), condition: z.enum(TOOL_CONDITION) })),
    pickupToolsNotes: z.string().trim().max(2000),
    pickupMaterials: z.string().trim().max(2000),
  })
  // Both halves have to be worth writing. The single-purpose pages already
  // cover "just a delivery" and "just a pickup"; a combined submit that leaves
  // one side empty would write an empty request row rather than saving anyone a
  // step. The `> 3` threshold matches the two schemas this projects into, so a
  // value that passes here can't fail their own refine afterwards.
  .refine(
    (value) =>
      value.deliveryTools.length > 0 ||
      value.deliveryMaterialLines.length > 0 ||
      value.deliveryMaterials.trim().length > 3,
    {
      message: "Add at least one tool or material to deliver.",
      path: ["deliveryTools"],
    }
  )
  .refine((value) => value.pickupTools.length > 0 || value.pickupMaterials.trim().length > 3, {
    message: "Add at least one tool to pick up, or enter pickup materials.",
    path: ["pickupTools"],
  })
  // Two projections of one picker selection — a mismatch means the form wired
  // one of them up wrong, worth failing loudly rather than writing a request
  // whose summary and `assignedtools` rows disagree.
  .refine((value) => value.pickupToolIds.length === value.pickupTools.length, {
    message: "Every picked tool must carry its id.",
    path: ["pickupToolIds"],
  })

export type CombinedRequestFormValues = z.infer<typeof combinedRequestFormSchema>

/**
 * The delivery half, in `createRequestAction`'s own shape.
 *
 * `startDate` and `endDate` are the same day on purpose: the page asks for one
 * date, and `createToolRequest` already handles a single-day range by ending
 * the calendar entry 30 minutes after it starts.
 */
export function toDeliveryValues(values: CombinedRequestFormValues): RequestFormValues {
  return {
    jobId: values.jobId,
    toDo: values.toDo,
    weAre: values.weAre,
    delivery: true,
    pickup: false,
    startDate: values.date,
    endDate: values.date,
    timeRange: values.timeRange,
    slotHour: values.slotHour,
    floor: values.floor,
    contact: values.contact,
    contactPhone: values.contactPhone,
    fieldPm: values.fieldPm,
    notes: values.notes,
    toolsNotes: values.deliveryToolsNotes,
    materials: values.deliveryMaterials,
    materialLines: values.deliveryMaterialLines,
    tentative: values.tentative,
    tools: values.deliveryTools,
  }
}

/**
 * The pickup half. `cleanup` carries through untouched —
 * `createPickupToolRequest` is what folds it into `notes`, and this half is the
 * only one it applies to.
 */
export function toPickupValues(values: CombinedRequestFormValues): PickupRequestFormValues {
  return {
    jobId: values.jobId,
    toDo: values.toDo,
    weAre: values.weAre,
    date: values.date,
    timeRange: values.timeRange,
    slotHour: values.slotHour,
    floor: values.floor,
    contact: values.contact,
    contactPhone: values.contactPhone,
    fieldPm: values.fieldPm,
    notes: values.notes,
    toolsNotes: values.pickupToolsNotes,
    materials: values.pickupMaterials,
    tentative: values.tentative,
    cleanup: values.cleanup,
    tools: values.pickupTools,
    toolIds: values.pickupToolIds,
    toolConditionUpdates: values.pickupToolConditionUpdates,
  }
}
