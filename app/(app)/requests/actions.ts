"use server"

import { revalidatePath } from "next/cache"
import { createToolRequest } from "@/lib/bubble/requests"
import { listJobs } from "@/lib/bubble/reference"
import { newYorkInstant } from "@/lib/bubble/dates"
import { buildSummary } from "@/lib/notify"
import { requestFormSchema } from "@/lib/schemas/request"
import type { CreateRequestState } from "./action-state"

/**
 * `react-hook-form` (via `zodResolver`) already validates this client-side, so
 * the object arriving here is normally clean. It is re-validated regardless of
 * what the client did: a server action is reachable by direct POST, and the
 * browser's validation is not a security boundary.
 */
export async function createRequestAction(input: unknown): Promise<CreateRequestState> {
  // const session = await requireSession()

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
    materials: values.materials,
  })

  let created
  try {
    created = await createToolRequest(values, job, summary)
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? `Bubble rejected the request: ${error.message}` : "Bubble rejected the request.",
    }
  }

  revalidatePath("/requests")

  return {
    status: "created",
    requestId: created.requestId,
    job: created.job,
  }
}
