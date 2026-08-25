import { z } from "zod"

import { TO_DO, WE_ARE } from "@/lib/bubble/enums"

/**
 * The one definition of a valid request, imported by both the form and the
 * server action. Field names here are the form's, not Bubble's — the mapping
 * onto Bubble's field names happens in `lib/bubble/requests.ts`.
 */

export const toolLineSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(99),
})

export const requestFormSchema = z
  .object({
    jobId: z.string().min(1, "Pick a job."),
    toDo: z.enum(TO_DO),
    weAre: z.enum(WE_ARE),
    delivery: z.boolean(),
    pickup: z.boolean(),
    /** `yyyy-mm-dd`, read as New York calendar dates. */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date."),
    /**
     * The chosen calendar slot's label, e.g. `"06:00 a.m. to 06:30 a.m."` —
     * this is what's written to Bubble's `timeRange` field. Still free text in
     * the schema because live rows also hold values no picker produced
     * ("Anytime", "TBD"), just no longer free-typed from this form.
     */
    timeRange: z.string().trim().max(120),
    /**
     * The same slot's start hour, 0–23 New York time — kept alongside
     * `timeRange` because Bubble has no field of its own for it. This is what
     * combines with `startDate` to produce the actual delivery instant
     * (`requestDateStart`); `endDate` is just the day tools are needed until,
     * with no time of its own.
     */
    slotHour: z.number().int().min(0).max(23),
    floor: z.string().trim().max(120),
    contact: z.string().trim().max(120),
    contactPhone: z.string().trim().max(40),
    fieldPm: z.string().trim().max(120),
    notes: z.string().trim().max(2000),
    toolsNotes: z.string().trim().max(2000),
    tentative: z.boolean(),
    tools: z.array(toolLineSchema).min(1, "Add at least one tool."),
  })
  .refine((value) => value.delivery || value.pickup, {
    message: "Pick delivery, pickup, or both.",
    path: ["delivery"],
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "End date can't be before the start date.",
    path: ["endDate"],
  })

export type RequestFormValues = z.infer<typeof requestFormSchema>
