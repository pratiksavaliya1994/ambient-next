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
  /** The tool's shelf/bin in the warehouse — static, ungated, never moved by a request or trip. */
  warehouseLocation: z.string().trim().max(120),
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

/**
 * What the Add tool form submits — resolved in the browser and re-parsed by
 * `createToolAction`, the same one-schema arrangement as `toolEditSchema`.
 *
 * It is a different shape rather than an extension of that one, and the three
 * differences are all deliberate:
 *
 * - **`name` exists here and nowhere else.** The edit form omits it on purpose
 *   (renaming a tool changes what a driver reads off a label), but a tool has
 *   to be named to exist, and it is the only thing identifying it.
 * - **`typeId` is required**, where the edit form tolerates `""`. Live rows
 *   exist with no `type` link, but those are legacy — a typeless tool is
 *   missing the only link from the physical unit to the catalogue requests are
 *   built from, and there is no reason to create more of them.
 * - **`condition` is a plain enum**, with none of `toolEditSchema`'s `""`
 *   escape hatch. That exists to avoid clobbering a blank or legacy value on a
 *   row nobody has touched since phase 3A; a new row has no such value to
 *   protect and starts at `Ok`.
 *
 * `statusNew` is absent for the same reason it is absent from the edit schema:
 * this form has no say in it. A new tool is `Available` — see `createTool`.
 */
export const toolCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give this tool a name.")
    .max(120, "That name is too long."),
  typeId: z.string().min(1, "Pick a tool type."),
  /**
   * Defaults to the warehouse in the form rather than being required here — a
   * picked value, never typed. As in `toolEditSchema` there is no `min(1)`,
   * because the meaningful check is "a place that actually exists" rather than
   * "non-empty", and that one needs the live `jobs` list; it lives in
   * `createToolAction` via `isKnownToolLocation`.
   */
  location: z.string().trim().max(200),
  floor: z.string().trim().max(120),
  warehouseLocation: z.string().trim().max(120),
  condition: z.enum(TOOL_CONDITION),
})

export type ToolCreateFormValues = z.infer<typeof toolCreateSchema>

/** The debounced/on-blur uniqueness probe behind the name field. */
export const toolNameCheckSchema = z.object({
  name: z.string().trim().min(1).max(120),
})
