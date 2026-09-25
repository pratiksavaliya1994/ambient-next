/**
 * Shared between `materials/actions.ts` and the catalogue forms (5C). Lives
 * outside the actions file because a `"use server"` file may only export async
 * functions — the same reason `tools/action-state.ts` exists.
 */

export type MaterialItemCreateState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  | { status: "error"; message: string }
  /**
   * `warning` is "the item exists, but its opening stock didn't save". A
   * warning rather than an error: reporting failure over a real row would send
   * someone off to create a second one.
   */
  | { status: "created"; itemId: string; name: string; warning?: string }

export const INITIAL_MATERIAL_ITEM_CREATE_STATE: MaterialItemCreateState = { status: "idle" }

export type MaterialItemEditState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  | { status: "error"; message: string }
  | { status: "saved"; itemId: string; name: string }

export const INITIAL_MATERIAL_ITEM_EDIT_STATE: MaterialItemEditState = { status: "idle" }

/** `stockQty` is the item's stock as Bubble now holds it, so the card can re-render off the write. */
export type AdjustStockState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  | { status: "error"; message: string }
  | { status: "saved"; stockQty: number; unchanged?: boolean }

export const INITIAL_ADJUST_STOCK_STATE: AdjustStockState = { status: "idle" }

/** The name field's uniqueness probe — `ToolNameCheck`'s shape, for materials. */
export type MaterialNameCheck =
  | { status: "idle" }
  | { status: "checking"; name: string }
  | { status: "available"; name: string }
  | { status: "taken"; name: string; itemId: string; existingName: string }
  /** The probe itself failed. Never blocks the save — the create/edit action re-checks. */
  | { status: "unknown"; name: string }

export const INITIAL_MATERIAL_NAME_CHECK: MaterialNameCheck = { status: "idle" }
