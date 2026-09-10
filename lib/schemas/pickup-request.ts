import { z } from "zod"

import { TO_DO, TOOL_STATUS_NEW, WE_ARE } from "@/lib/bubble/enums"
import { toolLineSchema } from "@/lib/schemas/request"

/**
 * The Pickup counterpart to `requestFormSchema` — same field names where the
 * concept is shared (so `createPickupToolRequest` can mirror `createToolRequest`
 * almost line for line), minus `delivery`/`pickup` (this form is pickup-only
 * by construction) and `endDate` (a pickup is a single visit, not a range).
 *
 * `cleanup` has no Bubble field of its own — it's folded into `notes` as free
 * text on write, since `CLAUDE.md` rules out adding a Bubble field for it.
 */

export const pickupRequestFormSchema = z
  .object({
    jobId: z.string().min(1, "Pick a job."),
    toDo: z.enum(TO_DO),
    weAre: z.enum(WE_ARE),
    /** `yyyy-mm-dd`, read as a New York calendar date. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
    timeRange: z.string().trim().max(120),
    slotHour: z.number().int().min(0).max(23),
    floor: z.string().trim().max(120),
    contact: z.string().trim().max(120),
    contactPhone: z.string().trim().max(40),
    fieldPm: z.string().trim().max(120),
    notes: z.string().trim().max(2000),
    toolsNotes: z.string().trim().max(2000),
    /** Free text, no separate selection — sent as-is, empty is valid. */
    materials: z.string().trim().max(2000),
    tentative: z.boolean(),
    /** Auto-selects the job's tools in the UI; has no Bubble field of its own. */
    cleanup: z.boolean(),
    tools: z.array(toolLineSchema),
    /** Only tools whose status the PM actually changed in the picker — see `lib/bubble/tool-status-updates.ts`. */
    toolStatusUpdates: z.array(z.object({ toolId: z.string(), status: z.enum(TOOL_STATUS_NEW) })),
  })
  .refine((value) => value.tools.length > 0 || value.materials.trim().length > 3, {
    message: "Add at least one tool or enter materials.",
    path: ["tools"],
  })

export type PickupRequestFormValues = z.infer<typeof pickupRequestFormSchema>
