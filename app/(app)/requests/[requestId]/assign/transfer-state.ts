/**
 * Result type for the transfer actions. Its own module because a `"use server"`
 * file may only export async functions.
 */
export type TransferActionState =
  | { status: "error"; message: string }
  /** `splitOff`: how much of the pickup's estimate was split into its own line, still for the warehouse. */
  | { status: "linked"; warning?: string; splitOff?: number }
  | { status: "unlinked"; warning?: string }
