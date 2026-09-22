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

/**
 * The Add tool form's result. Separate from `ToolEditState` because the two
 * end differently: an edit leaves you where you were, while a create has an id
 * that didn't exist a moment ago and a page to send you to.
 *
 * `warning` is the same "it saved, but not all of it" distinction the other two
 * draw, and here it means the row was created but some or all of its staged
 * photos didn't attach. That has to be a warning rather than an error: the
 * tool exists either way, the form is gone, and reporting failure over a real
 * row would send someone off to create a second one.
 */
export type ToolCreateState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  | { status: "error"; message: string }
  | { status: "created"; toolId: string; name: string; warning?: string }

export const INITIAL_TOOL_CREATE_STATE: ToolCreateState = { status: "idle" }

/**
 * The name field's uniqueness probe, run on a debounce while typing and again
 * on blur.
 *
 * `name` rides along on every settled result so the field can tell a verdict
 * about what is currently typed from one about what was typed two keystrokes
 * ago — the check is async and the input keeps moving under it.
 *
 * `taken` carries the offending tool's id so the form can link to it. Somebody
 * hitting this is usually about to discover the tool already exists rather
 * than needing to invent a different name.
 */
export type ToolNameCheck =
  | { status: "idle" }
  | { status: "checking"; name: string }
  | { status: "available"; name: string }
  | { status: "taken"; name: string; toolId: string; existingName: string }
  /** The probe itself failed. Never blocks the save — `createToolAction` re-checks. */
  | { status: "unknown"; name: string }

export const INITIAL_TOOL_NAME_CHECK: ToolNameCheck = { status: "idle" }
