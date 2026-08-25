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
  | { status: "created"; requestId: string; job: string }

export const INITIAL_CREATE_STATE: CreateRequestState = { status: "idle" }
