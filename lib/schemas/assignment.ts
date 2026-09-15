import { z } from "zod"

import { MAX_STOP_ORDER } from "@/lib/bubble/enums"

/**
 * What the assign screen submits. Validated in the client island **and**
 * re-validated in the action, the same pair `requestFormSchema` forms — a
 * server action is reachable by direct POST and the browser's validation is
 * not a security boundary.
 *
 * There is no `unassignSchema`: `create-assigned-tool` deletes the request's
 * existing rows before recreating them, so saving with a tool removed *is* the
 * unassign. One write path, not two.
 *
 * The shape here is also the wire shape — the workflow's `assignments`
 * parameter takes these objects as-is (Bubble Detect Data), so what validates
 * is what is sent.
 */

export const assignmentEntrySchema = z.object({
  toolId: z.string().min(1),
  extra: z.boolean(),
  /**
   * The slot's stored `toolType` string, or a tool's own type name for an
   * extra. Cosmetic — `buildSlots` groups on it, nothing resolves it back to a
   * `toolstype` row — so an empty string is allowed rather than rejected.
   */
  toolType: z.string(),
})

export const assignToolsSchema = z
  .object({
    requestId: z.string().min(1),
    assignments: z.array(assignmentEntrySchema),
  })
  // The panel already enforces this through `usedIds`; asserted again because a
  // duplicate would put one physical tool on two slots of the same request with
  // nothing downstream to catch it.
  .refine((value) => new Set(value.assignments.map((entry) => entry.toolId)).size === value.assignments.length, {
    message: "The same tool can't be assigned twice.",
    path: ["assignments"],
  })

export type AssignToolsValues = z.infer<typeof assignToolsSchema>

/**
 * What the Dispatch board submits: the selected `Assigned` requests and the
 * driver taking them out. No `toolIds` — the action derives the union of
 * assigned tools itself from fresh `assignedtools` rows rather than trusting
 * whatever the board's client state remembers.
 */
export const dispatchSchema = z.object({
  requestIds: z.array(z.string().min(1)).min(1),
  driver: z.string().min(1),
})

export type DispatchValues = z.infer<typeof dispatchSchema>

/**
 * What the offload screen submits: just the request. `toolIds` and the job's
 * name are derived server-side from fresh data, the same "don't trust the
 * client's copy" call `dispatchSchema` makes.
 */
export const offloadSchema = z.object({
  requestId: z.string().min(1),
})

export type OffloadValues = z.infer<typeof offloadSchema>

/**
 * What the Active trips screen submits to confirm one off-site pickup stop:
 * the request it belongs to, and just that stop's tool ids. Dispatch leaves
 * an off-site tool `Available` at its own site rather than moving it to
 * `In Transit` sight unseen (see `dispatchAction`); this is the driver saying
 * "I actually have it now."
 */
export const confirmPickupSchema = z.object({
  requestId: z.string().min(1),
  toolIds: z.array(z.string().min(1)).min(1),
})

export type ConfirmPickupValues = z.infer<typeof confirmPickupSchema>

/**
 * The opposite answer at the same stop: the driver got there and **couldn't**
 * take these tools. Same shape as `confirmPickupSchema` and deliberately a
 * separate export — the two write different tool statuses and `leaveBehindAction`
 * guards harder, so sharing one schema would invite sharing one action.
 */
export const leaveBehindSchema = z.object({
  requestId: z.string().min(1),
  toolIds: z.array(z.string().min(1)).min(1),
})

export type LeaveBehindValues = z.infer<typeof leaveBehindSchema>

/**
 * What a driver trip card submits when its stops are dragged into a new order:
 * whose trip it is, and every stop in its new position. No positions — the
 * action derives `101, 102, 103…` from the array itself (`toStopOrders`), the
 * same "don't trust the client's copy" call `dispatchSchema` makes by carrying
 * no `toolIds`.
 *
 * `driver` is sent so the action can re-read that trip live and refuse to
 * renumber a set that has since gained or lost a stop.
 */
export const setStopOrderSchema = z
  .object({
    driver: z.string().min(1),
    // Two, because a one-stop trip has no order to set. The cap is what keeps
    // `isSequenced` a total test — a 100th stop would collide with the
    // unsequenced default.
    requestIds: z.array(z.string().min(1)).min(2).max(MAX_STOP_ORDER),
  })
  .refine((value) => new Set(value.requestIds).size === value.requestIds.length, {
    message: "The same stop can't appear twice.",
    path: ["requestIds"],
  })

export type SetStopOrderValues = z.infer<typeof setStopOrderSchema>
