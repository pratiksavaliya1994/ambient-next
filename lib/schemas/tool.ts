import { z } from "zod"

import { TOOL_CONDITION } from "@/lib/bubble/tool-enums"

/**
 * What the tool detail form submits — resolved against in the browser by
 * `react-hook-form` and re-parsed by `updateToolAction`, the same one-schema
 * arrangement `pickupRequestFormSchema` uses.
 *
 * `name` is absent by design: it identifies the physical tool everywhere in the
 * business (it is what a driver reads off the label), and nothing in this app
 * resolves a tool by anything else when the `_id` is unavailable. Renaming
 * belongs in the old Bubble UI, if anywhere.
 *
 * `statusNew` is absent too, and is not an omission — see `markAvailable`.
 */
export const toolEditSchema = z.object({
  toolId: z.string().min(1),
  /** `toolstype._id`. Empty is legal: live rows exist with no `type` link at all. */
  typeId: z.string(),
  /**
   * Empty means **leave it alone**, not "clear it".
   *
   * Two kinds of live row make that necessary. `condition` was added in phase
   * 3A and is simply blank on rows nothing has touched since; and a row the old
   * Bubble UI edited can hold a value outside `TOOL_CONDITION` altogether. A
   * plain `z.enum` would reject both as invalid the moment the form loaded,
   * blocking a save that only wanted to change the type. So the select seeds
   * empty for anything it can't represent, the page shows the raw current value
   * beside it, and `updateToolAction` patches the field only when a real
   * condition was picked.
   */
  condition: z.enum(TOOL_CONDITION).or(z.literal("")),
  /**
   * A `jobs.name` or a warehouse name, **picked, never typed** — and empty on
   * the live rows that have no location at all, which must stay saveable.
   *
   * There is no `min(1)` because the meaningful check isn't "non-empty", it is
   * "actually a place that exists". `tools.location` is free text compared with
   * `equals` and nothing enforces referential integrity, so a near-miss
   * (`"warehouse"`, `"Warehouse "`) doesn't fail — it silently forks the Tools
   * dashboard into two cards that can't find each other, and `listToolsForJob`
   * finds neither from the other. That check needs the live `jobs` list, so it
   * lives in `updateToolAction`; the combobox is what makes it unreachable in
   * the UI.
   */
  location: z.string().trim().max(200),
  floor: z.string().trim().max(120),
  /** A display name, not a `user` link — `tools.currentUser` is free text. */
  currentUser: z.string().trim().max(120),
  /**
   * The whole of this form's power over `statusNew`: release the tool, or leave
   * it alone. Not a `statusNew` field with one legal value, because that would
   * invite a second one later.
   *
   * Every other value in `TOOL_STATUS_NEW` asserts a claim — `Assigned` means
   * an `assignedtools` row exists, `In Transit` and `Delivered` mean a
   * `triptool` row does. This page creates neither, so it can only ever say the
   * one thing that needs no row behind it: nothing holds this tool.
   */
  markAvailable: z.boolean(),
})

export type ToolEditFormValues = z.infer<typeof toolEditSchema>
