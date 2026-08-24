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
    /** `yyyy-mm-dd`, read as a New York calendar date. */
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
    /** Start hour of the chosen calendar slot, 0–23 New York time. */
    slotHour: z.number().int().min(0).max(23),
    /** Free text, and deliberately so — live rows hold "Anytime", "6-8am", "TBD". */
    timeRange: z.string().trim().max(120),
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

export type RequestFormValues = z.infer<typeof requestFormSchema>
