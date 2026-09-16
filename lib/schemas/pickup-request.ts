import { z } from "zod"

import { TO_DO, WE_ARE } from "@/lib/bubble/enums"
import { TOOL_CONDITION } from "@/lib/bubble/tool-enums"
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
    /**
     * The same physical tools as `tools`, but by **id** — one `assignedtools`
     * row apiece (phase 3B). `tools` carries only names, which is enough to
     * render the request and nothing else; this is what lets a trip actually
     * collect them later.
     *
     * A plain list of ids, **not** `create-assigned-tool`'s
     * `{ toolId, extra, toolType }` objects: `new-pickup-request` fans
     * `assign-request-tool` out over `Search for tools (unique id is in
     * toolIds)`, so the other two values are derived inside Bubble from the
     * tool row itself. See `toolIdsOfPickup` for why that is the better half of
     * the trade, not just the simpler one.
     */
    toolIds: z.array(z.string().min(1)),
    /** Only tools whose condition the PM actually changed in the picker — see `lib/bubble/tool-status-updates.ts`. */
    toolConditionUpdates: z.array(z.object({ toolId: z.string(), condition: z.enum(TOOL_CONDITION) })),
  })
  .refine((value) => value.tools.length > 0 || value.materials.trim().length > 3, {
    message: "Add at least one tool or enter materials.",
    path: ["tools"],
  })
  // `tools` and `toolIds` are two projections of one picker selection, so a
  // mismatch means the form wired one of them up wrong — worth failing loudly
  // here rather than writing a request whose summary and rows disagree.
  .refine((value) => value.toolIds.length === value.tools.length, {
    message: "Every picked tool must carry its id.",
    path: ["toolIds"],
  })

export type PickupRequestFormValues = z.infer<typeof pickupRequestFormSchema>
