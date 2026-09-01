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
