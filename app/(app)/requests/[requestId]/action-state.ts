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

/**
 * Closing a request by hand — the escape hatch for requested slots nobody will
 * ever fill.
 *
 * Its own union rather than a member on `OffloadState`: closing writes a status
 * and moves no tools, which is the opposite of what offload does, and the two
 * render side by side on the same page.
 */
export type CloseRequestState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "closed"; requestStatus: string }

export const INITIAL_CLOSE_REQUEST_STATE: CloseRequestState = { status: "idle" }
