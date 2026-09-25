import { UNFILTERED_TO_DO, type ToDo } from "@/lib/bubble/enums"

/**
 * The material catalogue (`materialitem`) and its audit trail
 * (`materialstockhistory`) as the app sees them, plus the pure helpers that
 * operate on them.
 *
 * Split out of `material-items.ts` for the reason `reference-types.ts` exists:
 * that module is `server-only`, and the catalogue screen and the request form's
 * picker both need these shapes in the browser. Nothing here touches Bubble.
 */

export type MaterialItem = {
  id: string
  name: string
  unit: string
  /**
   * Units at the warehouse. Can read **negative** — two managers assigning the
   * last units at the same moment both succeed (see Known limits in
   * `phase-5-materials.md`), and a stock `Adjust` is the fix.
   */
  stockQty: number
  category: string | null
  /** Which job types the item is offered for. Empty means all of them. */
  relatedTo: ToDo[]
  /** Soft delete. Lines point at items by id, so an item is retired, never deleted. */
  active: boolean
  notes: string | null
}

/**
 * The items offered for a job type — `toolTypesFor`'s rule with one addition:
 * an item with no `relatedTo` at all is offered everywhere, since the field is
 * optional on the catalogue form and an empty list reads as "not narrowed".
 */
export function itemsFor(items: readonly MaterialItem[], toDo: ToDo | null): MaterialItem[] {
  if (!toDo || toDo === UNFILTERED_TO_DO) return [...items]
  return items.filter((item) => item.relatedTo.length === 0 || item.relatedTo.includes(toDo))
}

/**
 * Trimmed and case-folded — the form of a name two items are considered to
 * share. `materialitem.name` has no uniqueness constraint in Bubble; this is
 * `normaliseToolName`'s rule, for the same reason.
 */
export function normaliseMaterialName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Every value `materialstockhistory.reason` may hold. Text in Bubble, read
 * through `z.enum` so an unexpected value breaks the history screen loudly
 * rather than rendering as something it isn't.
 *
 * `Receive` and `Adjust` come from `/materials`; `Assign`, `Unassign` and
 * `Release` from `assign-material-line`; `Return` from the trip workflows (5D,
 * 5F).
 */
export const STOCK_REASON = ["Receive", "Adjust", "Assign", "Unassign", "Return", "Release"] as const
export type StockReason = (typeof STOCK_REASON)[number]

/** The two reasons `adjust-material-stock` is ever sent. */
export type ManualStockReason = Extract<StockReason, "Receive" | "Adjust">

export type StockHistoryEntry = {
  id: string
  createdAt: string | null
  materialId: string
  /** Snapshot at the time of the change, so history reads after a rename. */
  materialName: string
  /** Signed: `-12` on an assign, `+5` on a return. */
  delta: number
  stockAfter: number | null
  reason: StockReason
  requestId: string | null
  tripId: string | null
  byName: string | null
  notes: string | null
}
