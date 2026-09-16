/**
 * Result types for the trip actions.
 *
 * Their own module because a `"use server"` file may only export async
 * functions — the same split `app/(app)/dispatch/action-state.ts` and its
 * siblings already make.
 *
 * Every success variant carries an optional `warning`: a trip write can land
 * fully on `tools` and only partly on `request.status`, and that is a thing to
 * report rather than a thing to fail. The convention is the app's own —
 * "it landed, but not all of it".
 */

export type TripDraftState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  | { status: "error"; message: string }
  | { status: "saved"; tripId: string; stops: number; tools: number; warning?: string }

export const INITIAL_TRIP_DRAFT_STATE: TripDraftState = { status: "idle" }

export type TripRunState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "started"; warning?: string }
  | {
      status: "stop-done"
      dropped: number
      loaded: number
      skipped: number
      refused: number
      returned: number
      warning?: string
    }
  | { status: "completed"; warning?: string }
  | { status: "cancelled" }

export const INITIAL_TRIP_RUN_STATE: TripRunState = { status: "idle" }

export type CloseRequestState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "closed"; requestStatus: string }

export const INITIAL_CLOSE_REQUEST_STATE: CloseRequestState = { status: "idle" }
