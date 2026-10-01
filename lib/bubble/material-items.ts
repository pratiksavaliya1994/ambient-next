import "server-only"

import { z } from "zod"

import {
  bubbleCreate,
  bubbleGet,
  bubbleList,
  bubbleListAll,
  bubblePatch,
  bubbleRunWorkflow,
  type BubbleThing,
} from "@/lib/bubble/client"
import { TO_DO, type ToDo } from "@/lib/bubble/enums"
import {
  normaliseMaterialName,
  STOCK_REASON,
  type ManualStockReason,
  type MaterialItem,
  type StockHistoryEntry,
  type StockHistoryPage,
} from "@/lib/bubble/material-items-types"

/**
 * Reading and writing the material catalogue (`materialitem`) and reading its
 * audit trail (`materialstockhistory`).
 *
 * **Never memoised**, unlike `reference.ts`: stock is exactly what changes
 * between visits, the same reason `pickup-tools.ts` isn't.
 *
 * Creating and editing an item are plain Data API writes — one row, no
 * children, the rule `/tools/new` follows. **`stockQty` is the exception**: it
 * only ever moves through a workflow (`adjust-material-stock` here,
 * `assign-request-materials` in `requested-materials.ts`, the trip workflows
 * later), so every change to it leaves a history row. `MaterialItemPatch` has
 * no `stockQty` so that can't be undone by accident.
 */

const MATERIAL_ITEM = "materialitem"
export const STOCK_HISTORY = "materialstockhistory"
const STOCK_HISTORY_PAGE_SIZE = 25
const ADJUST_STOCK_WORKFLOW = "adjust-material-stock"

const IS_TO_DO = new Set<string>(TO_DO)

const materialItemRow = z.looseObject({
  _id: z.string(),
  name: z.string().optional(),
  unit: z.string().optional(),
  stockQty: z.number().optional(),
  category: z.string().optional(),
  warehouseLocation: z.string().optional(),
  relatedTo: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  notes: z.string().optional(),
})

function toMaterialItem(raw: BubbleThing): MaterialItem {
  const row = materialItemRow.parse(raw)
  return {
    id: row._id,
    name: row.name?.trim() ?? "",
    unit: row.unit?.trim() ?? "",
    stockQty: row.stockQty ?? 0,
    category: row.category?.trim() || null,
    warehouseLocation: row.warehouseLocation?.trim() || null,
    relatedTo: (row.relatedTo ?? []).filter((value): value is ToDo => IS_TO_DO.has(value)),
    // Bubble defaults `active` to yes, so an absent value is a row that
    // predates the default rather than a retired one.
    active: row.active ?? true,
    notes: row.notes?.trim() || null,
  }
}

const byName = (a: MaterialItem, b: MaterialItem) => a.name.localeCompare(b.name)

/**
 * The whole catalogue, sorted by name. Retired items are left out unless asked
 * for — filtered here rather than by a constraint, because `active equals yes`
 * would also drop a row with no `active` at all.
 */
export async function listMaterialItems({ includeInactive = false } = {}): Promise<MaterialItem[]> {
  const items = (await bubbleListAll(MATERIAL_ITEM)).map(toMaterialItem)
  return (includeInactive ? items : items.filter((item) => item.active)).sort(byName)
}

/** These items, retired or not — the fresh read an assign or a create checks stock and names against. */
export async function listMaterialItemsByIds(ids: readonly string[]): Promise<MaterialItem[]> {
  if (ids.length === 0) return []
  const rows = await bubbleListAll(MATERIAL_ITEM, {
    constraints: [{ key: "_id", constraint_type: "in", value: [...new Set(ids)] }],
  })
  return rows.map(toMaterialItem)
}

export async function getMaterialItem(id: string): Promise<MaterialItem | null> {
  const row = await bubbleGet(MATERIAL_ITEM, id)
  return row ? toMaterialItem(row) : null
}

/** The item already wearing a name, so the form can link to it rather than just refuse. */
export type MaterialNameClash = { id: string; name: string }

/**
 * The item whose name collides with `name`, or `null` — `findToolNameClash`'s
 * recipe: `text contains` as a case-insensitive prefilter, then the exact
 * comparison on what comes back.
 *
 * `exceptId` lets an edit keep its own name without clashing with itself.
 */
export async function findMaterialNameClash(name: string, exceptId?: string): Promise<MaterialNameClash | null> {
  const wanted = normaliseMaterialName(name)
  if (wanted === "") return null

  const rows = await bubbleListAll(MATERIAL_ITEM, {
    constraints: [{ key: "name", constraint_type: "text contains", value: name.trim() }],
  })

  const clash = rows
    .map(toMaterialItem)
    .find((item) => item.id !== exceptId && normaliseMaterialName(item.name) === wanted)

  return clash ? { id: clash.id, name: clash.name } : null
}

/** What the catalogue form decides about an item. Stock is not one of them. */
export type MaterialItemFields = {
  name: string
  unit: string
  category: string
  warehouseLocation: string
  relatedTo: ToDo[]
  notes: string
}

/**
 * Writes the row with `stockQty = 0` and returns its `_id`. Opening stock, if
 * any, is a separate `adjustMaterialStock` call with `Receive`, so it is
 * audited like every other change.
 */
export async function createMaterialItem(fields: MaterialItemFields): Promise<string> {
  return bubbleCreate(MATERIAL_ITEM, { ...fields, stockQty: 0, active: true })
}

/** Everything an edit may change. **No `stockQty`** — see the module comment. */
/** No `name`: an item's name is fixed once it's created. */
export type MaterialItemPatch = Omit<MaterialItemFields, "name"> & { active: boolean }

export async function updateMaterialItem(id: string, patch: MaterialItemPatch): Promise<void> {
  await bubblePatch(MATERIAL_ITEM, id, patch)
}

export type StockAdjustment = {
  /** One per press of the button, generated server-side. A retry with the same key writes nothing. */
  idempotencyKey: string
  materialId: string
  /** Signed. A "correct to count" is `counted − current`, computed by the caller from a fresh read. */
  delta: number
  reason: ManualStockReason
  byName: string
  notes: string
}

const adjustResult = z.looseObject({ stockQty: z.number() })

/**
 * `POST /wf/adjust-material-stock` — returns the item's stock **as Bubble now
 * holds it**. The workflow re-reads the item for its return, so a retried call
 * (same key, nothing written) still reports the right number.
 */
export async function adjustMaterialStock(adjustment: StockAdjustment): Promise<number> {
  const raw = await bubbleRunWorkflow(ADJUST_STOCK_WORKFLOW, adjustment)
  return adjustResult.parse(raw).stockQty
}

const stockHistoryRow = z.looseObject({
  _id: z.string(),
  "Created Date": z.string().optional(),
  materialID: z.string().optional(),
  materialName: z.string().optional(),
  delta: z.number().optional(),
  stockAfter: z.number().optional(),
  reason: z.enum(STOCK_REASON),
  requestID: z.string().optional(),
  tripID: z.string().optional(),
  byName: z.string().optional(),
  notes: z.string().optional(),
  location: z.string().optional(),
})

/** One history row as the app reads it. Exported for `site-stock.ts`, which reads the same table by `location`. */
export function toStockHistoryEntry(raw: BubbleThing): StockHistoryEntry {
  const row = stockHistoryRow.parse(raw)
  return {
    id: row._id,
    createdAt: row["Created Date"] ?? null,
    materialId: row.materialID ?? "",
    materialName: row.materialName ?? "",
    delta: row.delta ?? 0,
    stockAfter: row.stockAfter ?? null,
    reason: row.reason,
    requestId: row.requestID || null,
    tripId: row.tripID || null,
    byName: row.byName?.trim() || null,
    notes: row.notes?.trim() || null,
    location: row.location?.trim() ?? "",
  }
}

/**
 * One page of an item's stock changes, newest first — warehouse and site rows
 * in one mixed list, each carrying its `location`. `cursor` is Bubble's offset;
 * a row written between two page loads shifts the rest down by one, so the
 * caller dedupes on `id`.
 */
export async function listStockHistoryPage(materialId: string, cursor = 0): Promise<StockHistoryPage> {
  const page = await bubbleList(STOCK_HISTORY, {
    constraints: [{ key: "materialID", constraint_type: "equals", value: materialId }],
    sortField: "Created Date",
    descending: true,
    limit: STOCK_HISTORY_PAGE_SIZE,
    cursor,
  })

  return {
    entries: page.results.map((raw) => ({ ...toStockHistoryEntry(raw), materialId })),
    nextCursor: page.remaining > 0 ? cursor + page.results.length : null,
  }
}
