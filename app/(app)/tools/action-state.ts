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

/**
 * The photo controls' result, separate from `ToolEditState` because photos
 * save on their own rather than through the Save changes button. Three
 * reasons they had to: an upload is its own round trip and wants its own
 * spinner; `updateToolAction` refuses a *whole* save while something holds the
 * tool, which a photo has no reason to be caught by; and a file input has no
 * sensible dirty state to fold into `react-hook-form`.
 *
 * `photos` is the list as Bubble now holds it, so the grid re-renders off the
 * write itself instead of waiting for the revalidated page behind it.
 *
 * `warning` is "it saved, but not all of it" — the same distinction
 * `ToolEditState` draws. Here it means some of a batch failed to upload while
 * the rest attached fine, which is worth saying over a plain success.
 */
export type ToolPhotoState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved"; photos: string[]; warning?: string }

export const INITIAL_TOOL_PHOTO_STATE: ToolPhotoState = { status: "idle" }
