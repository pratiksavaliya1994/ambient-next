import { z } from "zod"

import { TO_DO, WE_ARE } from "@/lib/bubble/enums"
import { materialLinesSchema } from "@/lib/schemas/material"

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
    /** Filled from `jobs.gc` when a job is picked, then editable. Written to `request.realGC`. */
    gc: z.string().trim().max(120),
    toDo: z.enum(TO_DO, { error: "Pick a job type." }),
    weAre: z.enum(WE_ARE, { error: "Pick who we are." }),
    delivery: z.boolean(),
    pickup: z.boolean(),
    /** `yyyy-mm-dd`, read as New York calendar dates. */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date."),
    /**
     * The PM's preferred time as free text, written to Bubble's `timeRange` —
     * blank when they have no preference. It no longer sets the delivery
     * instant: `requestDateStart` is always `startDate` at `DEFAULT_START_HOUR`
     * (see `lib/bubble/requests.ts`).
     */
    timeRange: z.string().trim().max(120),
    floor: z.string().trim().max(120),
    contact: z.string().trim().max(120),
    contactPhone: z.string().trim().max(40),
    fieldPm: z.string().trim().max(120),
    notes: z.string().trim().max(2000),
    toolsNotes: z.string().trim().max(2000),
    /**
     * Phase 5 structured lines. Resolved against the catalogue server-side
     * before sending. Since 5C they're the delivery form's only materials: the
     * legacy `materials` text `new-request` still takes is their summary.
     */
    materialLines: materialLinesSchema,
    tentative: z.boolean(),
    tools: z.array(toolLineSchema),
  })
  .refine((value) => value.delivery || value.pickup, {
    message: "Pick delivery, pickup, or both.",
    path: ["delivery"],
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "End date can't be before the start date.",
    path: ["endDate"],
  })
  .refine((value) => value.tools.length > 0 || value.materialLines.length > 0, {
    message: "Add at least one tool or material.",
    path: ["tools"],
  })

export type RequestFormValues = z.infer<typeof requestFormSchema>
