/**
 * Split out for the same reason `app/(app)/dispatch/action-state.ts` is: a
 * `"use server"` file can only export async functions, so this shared result
 * type and its initial-state constant live here instead, imported by both
 * `actions.ts` and `components/pickup-stop-list.tsx`.
 */

export type PickupState =
  | { status: "idle" }
  | { status: "error"; message: string }
  /**
   * `warning` is the "tools didn't all update" case — the mirror of
   * `DispatchState`/`OffloadState`'s own `warning` slot.
   */
  | { status: "picked-up"; warning?: string }

export const INITIAL_PICKUP_STATE: PickupState = { status: "idle" }
