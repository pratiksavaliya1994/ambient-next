/**
 * Shared between `tools/[toolId]/actions.ts` and the form it feeds. It lives
 * outside both because a `"use server"` file may only export async functions,
 * so `INITIAL_TOOL_EDIT_STATE` cannot sit beside the action — the same reason
 * `requests/action-state.ts` exists.
 */

export type ToolEditState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  | { status: "error"; message: string }
  /**
   * `warning` is "it saved, but Bubble didn't take all of it". An option-set
   * write with an unrecognised display text **fails silently** in Bubble — no
   * error, no change — so the action re-reads the row and compares. Reporting
   * that as an error would be a lie about a save that did happen; reporting it
   * as clean success hides real drift.
   */
  | { status: "saved"; toolId: string; name: string; warning?: string }

export const INITIAL_TOOL_EDIT_STATE: ToolEditState = { status: "idle" }
