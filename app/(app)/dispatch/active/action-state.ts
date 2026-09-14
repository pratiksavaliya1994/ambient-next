/**
 * Split out for the same reason `app/(app)/dispatch/action-state.ts` is: a
 * `"use server"` file can only export async functions, so this shared result
 * type and its initial-state constant live here instead, imported by
 * `actions.ts`, `components/pickup-tool-button.tsx` and
 * `components/leave-behind-button.tsx`.
 *
 * One type for both answers a driver can give at a pickup stop, since the two
 * buttons sit side by side on the same row and fail in exactly the same ways.
 */

export type PickupState =
  | { status: "idle" }
  | { status: "error"; message: string }
  /**
   * `warning` is the "tools didn't all update" case — the mirror of
   * `DispatchState`/`OffloadState`'s own `warning` slot.
   */
  | { status: "picked-up"; warning?: string }
  /** The tool was reached but couldn't be taken; it stays where it is. */
  | { status: "left-behind"; warning?: string }

export const INITIAL_PICKUP_STATE: PickupState = { status: "idle" }
