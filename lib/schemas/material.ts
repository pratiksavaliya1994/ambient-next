import { z } from "zod"

import { TO_DO } from "@/lib/bubble/enums"
import { formatMaterialLine, type ResolvedMaterialLine } from "@/lib/bubble/requested-materials-types"

/**
 * Every material payload — form in, and the one wire shape out to Bubble whose
 * field names differ from the app's.
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

/**
 * One `materialLines` item as `new-request` takes it.
 *
 * **`materialID`, uppercase `ID`** — the parameter is typed as the existing
 * `requestedmaterials` Bubble type rather than a custom shape, so its items
 * carry that type's field names (5B §1.4). Everywhere else in the app it is
 * `materialId`, and `adjust-material-stock` / `assign-request-materials` take
 * the lowercase forms. This schema and `toNewRequestMaterialLines` are the only
 * place the uppercase spelling may appear; get it wrong and Bubble creates the
 * row with a blank `materialID`, silently.
 *
 * `quantity` is omitted rather than sent null for a lot with none, so the
 * number field stays blank in Bubble.
 */
const newRequestMaterialLineWire = z.object({
  kind: z.enum(["Inventory", "NonInventory"]),
  materialID: z.string(),
  name: z.string().min(1),
  unit: z.string(),
  quantity: z.number().int().min(1).optional(),
  /** Pre-formatted `Name: qty unit`, from the shared codec. */
  materials: z.string(),
})

export function toNewRequestMaterialLines(lines: readonly ResolvedMaterialLine[]) {
  return lines.map((line) =>
    newRequestMaterialLineWire.parse({
      kind: line.kind,
      materialID: line.materialId ?? "",
      name: line.name,
      unit: line.unit ?? "",
      ...(line.quantity !== null ? { quantity: line.quantity } : {}),
      materials: formatMaterialLine(line),
    })
  )
}

/** The catalogue fields an item form edits. Stock is not one of them. */
export const materialItemSchema = z.object({
  name: z.string().trim().min(1, "Give this material a name.").max(120, "That name is too long."),
  unit: z.string().trim().min(1, "Give it a unit — bag, box, gal, each.").max(40),
  category: z.string().trim().max(80),
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

/** `/materials/[itemId]`: the fields plus retire/restore. */
export const materialItemEditSchema = materialItemSchema.extend({
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
 * The assign card's save: a **target** quantity per line, never a delta — see
 * `assignMaterials`. `0` is legal: it un-assigns (or un-approves) the line.
 */
export const assignMaterialsSchema = z.object({
  requestId: z.string().min(1),
  lines: z
    .array(z.object({ lineId: z.string().min(1), targetQty: z.number().int().min(0).max(99999) }))
    .min(1)
    .max(50)
    .refine((lines) => new Set(lines.map((line) => line.lineId)).size === lines.length, "A line appears twice."),
})

export type AssignMaterialsValues = z.infer<typeof assignMaterialsSchema>
