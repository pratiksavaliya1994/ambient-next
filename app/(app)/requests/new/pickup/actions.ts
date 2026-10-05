"use server"

import { revalidatePath } from "next/cache"
import { createPickupToolRequest } from "@/lib/bubble/requests"
import { listJobs } from "@/lib/bubble/reference"
import { listToolsForJob, type PickupTool } from "@/lib/bubble/pickup-tools"
import { newYorkInstant } from "@/lib/bubble/dates"
import { buildSummary } from "@/lib/notify"
import { requireSession } from "@/lib/auth/session"
import { resolveMaterialLines } from "@/lib/bubble/requested-materials"
import { pickupRequestFormSchema } from "@/lib/schemas/pickup-request"
import { settleNewPickup } from "./settle-pickup"
import type { CreateRequestState } from "@/app/(app)/requests/action-state"

/** The client component can't call server-only Bubble code directly — this is that seam. */
export async function fetchToolsForJobAction(jobName: string): Promise<PickupTool[]> {
  await requireSession()
  return listToolsForJob(jobName)
}

/**
 * Re-validated regardless of what the client did, same as `createRequestAction` —
 * a server action is reachable by direct POST, and the browser's validation is
 * not a security boundary.
 */
export async function createPickupRequestAction(input: unknown): Promise<CreateRequestState> {
  await requireSession()

  const parsed = pickupRequestFormSchema.safeParse(input)
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

  // As on the delivery form: inventory lines take their name and unit from a
  // fresh catalogue read, and a retired item refuses the submit.
  const resolved = await resolveMaterialLines(values.materialLines)
  if (!resolved.ok) return { status: "error", message: resolved.message }

  const summary = buildSummary({
    requestedBy: values.fieldPm,
    job: job.name,
    jobDetails: job.description,
    gc: job.gc,
    toDo: values.toDo,
    weAre: values.weAre,
    delivery: false,
    pickup: true,
    floor: values.floor,
    contact: values.contact,
    contactPhone: values.contactPhone,
    fieldPm: values.fieldPm,
    start: newYorkInstant(values.date).toISOString(),
    end: newYorkInstant(values.date).toISOString(),
    timeRange: values.timeRange,
    notes: values.notes,
    tools: values.tools,
    toolsNotes: values.toolsNotes,
    materialLines: resolved.lines,
  })

  let created
  try {
    created = await createPickupToolRequest(values, job, summary, resolved.lines)
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? `Bubble rejected the request: ${error.message}` : "Bubble rejected the request.",
    }
  }

  const warning = await settleNewPickup(created.requestId, resolved.lines.length)

  revalidatePath("/requests")

  return {
    status: "created",
    requestId: created.requestId,
    job: created.job,
    warning,
  }
}
