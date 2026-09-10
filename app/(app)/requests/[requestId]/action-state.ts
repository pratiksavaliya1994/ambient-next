/**
 * Split out for the same reason `app/(app)/dispatch/action-state.ts` is: a
 * `"use server"` file can only export async functions, so this shared result
 * type and its initial-state constant live here instead, imported by both
 * `actions.ts` and `complete-delivery-action.tsx`.
 */

export type OffloadState =
  | { status: "idle" }
  | { status: "error"; message: string }
  /**
   * `warning` is the "request moved, not every tool did" case — the mirror of
   * `DispatchState`'s own `warning` slot.
   */
  | { status: "delivered"; warning?: string }

export const INITIAL_OFFLOAD_STATE: OffloadState = { status: "idle" }
