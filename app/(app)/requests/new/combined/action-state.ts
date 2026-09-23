/**
 * Lives beside `actions.ts` rather than in it for the same reason
 * `app/(app)/requests/action-state.ts` does: a `"use server"` file can only
 * export async functions, so a plain constant like `INITIAL_COMBINED_STATE`
 * breaks the build there.
 *
 * It is a type of its own rather than a reuse of `CreateRequestState` because a
 * combined submit has an outcome that one has no way to express: **two rows,
 * written by two calls, with no transaction between them.** `partial` is that
 * outcome, and it is a real state, not an error — see `createCombinedRequestAction`.
 */

/** Which of the two calls a `partial` result got through. */
export type CombinedHalf = "pickup" | "delivery"

export type CombinedRequestState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  /** Nothing was written — the first call failed, so the second never ran. */
  | { status: "error"; message: string }
  /**
   * One request exists and the other does not. The form stays filled so the
   * failed half can be retried; nothing is rolled back, because the workflow
   * that succeeded also stamped `jobs.lastRequest`, wrote a `notifications`
   * row and fired ClickUp/Calendar/WhatsApp, none of which a `DELETE` undoes.
   */
  | { status: "partial"; message: string; created: CombinedHalf; requestId: string; job: string }
  | { status: "created"; pickupRequestId: string; deliveryRequestId: string; job: string }

export const INITIAL_COMBINED_STATE: CombinedRequestState = { status: "idle" }
