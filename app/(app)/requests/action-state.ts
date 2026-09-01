/**
 * `actions.ts` has `"use server"` at the top, which restricts it to exporting
 * async functions only — a plain value export like `INITIAL_CREATE_STATE`
 * breaks both the client bundle (it gets wrapped as a server reference,
 * turning a `useState` seed into a Promise) and the build itself ("A 'use
 * server' file can only export async functions"). This type and constant are
 * shared between the action and the form, so they live here instead.
 */

export type CreateRequestState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  | { status: "error"; message: string }
  /**
   * `warning` is the "it landed, but not all of it" case, used by the assign
   * action: the `assignedtools` rows committed and a follow-up `tools.status`
   * write didn't. Reporting that as an error would be a lie about a save that
   * actually happened, and reporting it as a clean success hides real drift.
   * The create form never sets it and ignores it.
   */
  | { status: "created"; requestId: string; job: string; warning?: string }

export const INITIAL_CREATE_STATE: CreateRequestState = { status: "idle" }
