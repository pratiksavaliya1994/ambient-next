import { z } from "zod"

import { TO_DO } from "@/lib/bubble/enums"
import { formatMaterialLine, type ResolvedMaterialLine } from "@/lib/bubble/requested-materials-types"

/**
 * Every material payload — form in, and the one delimited wire text out to
 * `new-request`.
 *
 * Quantities are positive whole numbers throughout; the unit carries the
 * meaning. Bubble doesn't enforce integers, so this does.
 */

const quantity = z.number().int().min(1).max(99999)

/**
 * One line on a request form. **Inventory** names a catalogue item and a
 * quantity — nothing else, because `name` and `unit` are filled server-side
 * from a fresh catalogue read (`resolveMaterialLines`). **NonInventory** is
 * free text with an optional quantity (`null` = one lot) and unit.
 */
export const materialLineInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("Inventory"),
    materialId: z.string().min(1),
    quantity,
  }),
  z.object({
    kind: z.literal("NonInventory"),
    name: z.string().trim().min(1, "Describe the item.").max(200),
    quantity: quantity.nullable(),
    unit: z.string().trim().max(40),
  }),
])

export type MaterialLineInput = z.infer<typeof materialLineInputSchema>

/** The cap a request form may send, shared by both forms that carry lines. */
export const materialLinesSchema = z.array(materialLineInputSchema).max(50)

const FIELD_SEPARATOR = "::"

/**
 * One field made safe to sit between separators: a `::` — or a `:` at either
 * edge, which joins a neighbouring separator into `:::` — would shift every
 * later field.
 */
function wireField(value: string): string {
  return value.replace(/:{2,}/g, ":").replace(/^:+|:+$/g, "")
}

/**
 * `new-request`'s `materialLines` — a **list of texts**, one per line, its
 * fields joined by `::`, which Bubble splits apart when it schedules
 * `create-requested-material` on the list. The parameter was a list of the
 * `requestedmaterials` type, which Bubble reads as row ids and rejects.
 *
 * Field order is fixed and **is the contract**:
 * `kind::materialID::name::unit::quantity::materials`. `materialID` and `unit`
 * are empty for a non-inventory line without them, and `quantity` is empty for a
 * lot with none, so the number field stays blank in Bubble. `materials` is the
 * pre-formatted `Name: qty unit` from the shared codec.
 *
 *     ["Inventory::1758…x2::Acetone::gal::1::Acetone: 1 gal", "NonInventory::::Rags::::2::Rags: 2"]
 */
export function toNewRequestMaterialLines(lines: readonly ResolvedMaterialLine[]): string[] {
  return lines.map((line) =>
    [
      line.kind,
      line.materialId ?? "",
      line.name,
      line.unit ?? "",
      line.quantity !== null ? String(line.quantity) : "",
      formatMaterialLine(line),
    ]
      .map(wireField)
      .join(FIELD_SEPARATOR)
  )
}

/** The catalogue fields an item form edits. Stock is not one of them. */
export const materialItemSchema = z.object({
  name: z.string().trim().min(1, "Give this material a name.").max(120, "That name is too long."),
  unit: z.string().trim().min(1, "Give it a unit — bag, box, gal, each.").max(40),
  category: z.string().trim().max(80),
  /** Static shelf/bin in the warehouse. Stock movements never touch it. */
  warehouseLocation: z.string().trim().max(120),
  /** Empty means offered for every job type. */
  relatedTo: z.array(z.enum(TO_DO)),
  notes: z.string().trim().max(2000),
})

export type MaterialItemFormValues = z.infer<typeof materialItemSchema>

/** `/materials/new`: the fields plus an opening stock, received through the audited workflow. */
export const materialItemCreateSchema = materialItemSchema.extend({
  openingStock: z.number().int().min(0).max(99999),
})

export type MaterialItemCreateValues = z.infer<typeof materialItemCreateSchema>

/**
 * `/materials/[itemId]`: the fields plus retire/restore. The name is fixed once
 * created — requests and history carry it — so it isn't editable here.
 */
export const materialItemEditSchema = materialItemSchema.omit({ name: true }).extend({
  itemId: z.string().min(1),
  active: z.boolean(),
})

export type MaterialItemEditValues = z.infer<typeof materialItemEditSchema>

/** The debounced/on-blur uniqueness probe behind the name field. */
export const materialNameCheckSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** The item being edited, which may keep its own name. */
  exceptId: z.string().optional(),
})

/**
 * Receive adds `quantity`; correct sets stock **to** `quantity` (a count), which
 * the action turns into a delta from a fresh read.
 */
export const adjustStockSchema = z
  .object({
    itemId: z.string().min(1),
    mode: z.enum(["receive", "correct"]),
    quantity: z.number().int().min(0).max(99999),
    notes: z.string().trim().max(500),
  })
  .refine((value) => value.mode === "correct" || value.quantity > 0, {
    message: "Receive at least one.",
    path: ["quantity"],
  })

export type AdjustStockValues = z.infer<typeof adjustStockSchema>

/**
 * The assign screen's material half: a **target** quantity per line, never a
 * delta — see `assignMaterials`. `0` is legal: it un-assigns (or un-approves)
 * the line. Empty when no line moved; the combined save in
 * `saveAssignmentSchema` carries it beside the tools.
 */
export const materialTargetsSchema = z
  .array(z.object({ lineId: z.string().min(1), targetQty: z.number().int().min(0).max(99999) }))
  .max(50)
  .refine((lines) => new Set(lines.map((line) => line.lineId)).size === lines.length, "A line appears twice.")

export type MaterialTargetValues = z.infer<typeof materialTargetsSchema>
