"use server"

import { revalidatePath } from "next/cache"
import { describeBubbleError } from "@/lib/bubble/client"
import { createToolRequest } from "@/lib/bubble/requests"
import { listJobs } from "@/lib/bubble/reference"
import { newYorkInstant } from "@/lib/bubble/dates"
import { buildSummary } from "@/lib/notify"
import { requireSession } from "@/lib/auth/session"
import { materialLinesWarning, resolveMaterialLines } from "@/lib/bubble/requested-materials"
import { requestFormSchema } from "@/lib/schemas/request"
import type { CreateRequestState } from "./action-state"

/**
 * `react-hook-form` (via `zodResolver`) already validates this client-side, so
 * the object arriving here is normally clean. It is re-validated regardless of
 * what the client did: a server action is reachable by direct POST, and the
 * browser's validation is not a security boundary.
 */
export async function createRequestAction(input: unknown): Promise<CreateRequestState> {
  // The submitter's identity isn't used — `fieldPM2` is what owns a request and
  // `Created By` is the API token's owner regardless. This is the auth boundary,
  // nothing more: `proxy.ts` redirects for UX and is not one (CVE-2025-29927).
  await requireSession()

  const parsed = requestFormSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form")
      fieldErrors[key] ??= issue.message
    }
    return {
      status: "invalid",
      message: "Some fields need fixing.",
      fieldErrors,
    }
  }

  const values = parsed.data

  const job = (await listJobs()).find((entry) => entry.id === values.jobId)
  if (!job) {
    return { status: "error", message: "That job no longer exists in Bubble." }
  }

  // Inventory lines take their name and unit from a fresh catalogue read, and
  // an unknown or retired item refuses the submit before anything is written.
  const resolved = await resolveMaterialLines(values.materialLines)
  if (!resolved.ok) return { status: "error", message: resolved.message }

  // Built before the request exists — the message never references the
  // request's id — so the one Bubble workflow call can carry it alongside
  // everything else instead of composing it afterward.
  const summary = buildSummary({
    requestedBy: values.fieldPm,
    job: job.name,
    jobDetails: job.description,
    gc: job.gc,
    toDo: values.toDo,
    weAre: values.weAre,
    delivery: values.delivery,
    pickup: values.pickup,
    floor: values.floor,
    contact: values.contact,
    contactPhone: values.contactPhone,
    fieldPm: values.fieldPm,
    start: newYorkInstant(values.startDate).toISOString(),
    end: newYorkInstant(values.endDate).toISOString(),
    timeRange: values.timeRange,
    notes: values.notes,
    tools: values.tools,
    toolsNotes: values.toolsNotes,
    // No free text on the delivery form since 5C — the lines are the materials.
    materials: "",
    materialLines: resolved.lines,
  })

  let created
  try {
    created = await createToolRequest(values, job, summary, resolved.lines)
  } catch (error) {
    return { status: "error", message: `Bubble rejected the request: ${describeBubbleError(error)}` }
  }

  const warning = await materialLinesWarning(created.requestId, resolved.lines.length)

  revalidatePath("/requests")

  return {
    status: "created",
    requestId: created.requestId,
    job: created.job,
    warning,
  }
}
