/**
 * Split out for the same reason `app/(app)/requests/action-state.ts` is: a
 * `"use server"` file can only export async functions, so this shared result
 * type and its initial-state constant live here instead, imported by both
 * `actions.ts` and `dispatch-board.tsx`.
 */

export type DispatchState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  | { status: "error"; message: string }
  /**
   * `warning` is the "requests moved, not every tool did" case — the mirror of
   * `CreateRequestState`'s own `warning` slot for the assign flow. Reporting it
   * as an error would be a lie (the requests really did move); reporting it as
   * a clean success would hide a `tools.statusNew` write that didn't land.
   */
  | { status: "dispatched"; count: number; warning?: string }

export const INITIAL_DISPATCH_STATE: DispatchState = { status: "idle" }
