import { z } from "zod"

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
