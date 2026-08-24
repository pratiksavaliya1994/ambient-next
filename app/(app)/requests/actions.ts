"use server"

import { revalidatePath } from "next/cache"

import { displayNameOf, requireSession } from "@/lib/auth/session"
import { createToolRequest } from "@/lib/bubble/requests"
import { listJobs } from "@/lib/bubble/reference"
import { newYorkInstant } from "@/lib/bubble/dates"
import { buildSummary, notifyNewRequest } from "@/lib/notify"
import { requestFormSchema } from "@/lib/schemas/request"

export type CreateRequestState =
  | { status: "idle" }
  | { status: "invalid"; message: string; fieldErrors: Record<string, string> }
  | { status: "error"; message: string }
  | {
      status: "created"
      requestId: string
      job: string
      warning: string | null
    }

export const INITIAL_CREATE_STATE: CreateRequestState = { status: "idle" }

/**
 * The whole form arrives as one JSON string rather than as loose `FormData`
 * entries. The tool selection is an array of objects, which `FormData` can
 * only carry as parallel fields that then have to be re-zipped — JSON keeps
 * one shape on both sides of the boundary and lets the same Zod schema
 * validate it in the browser and again here.
 *
 * Validated again here regardless of what the client did: a server action is
 * reachable by direct POST.
 */
export async function createRequestAction(
  _previous: CreateRequestState,
  formData: FormData
): Promise<CreateRequestState> {
  const session = await requireSession()

  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""))
  } catch {
    return { status: "error", message: "Could not read the form." }
  }

  const parsed = requestFormSchema.safeParse(raw)
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

  let created
  try {
    created = await createToolRequest(values)
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? `Bubble rejected the request: ${error.message}`
          : "Bubble rejected the request.",
    }
  }

  // The request row exists from here on. Nothing below may turn this into a
  // failure — the user is told what did and did not land instead.
  const warnings: string[] = []
  if (!created.toolsRowId) {
    warnings.push(
      "The request saved but its tool list did not. Add the tools in Bubble, or delete the request and try again."
    )
  }

  const job = (await listJobs()).find((entry) => entry.id === values.jobId)
  const notification = {
    requestId: created.requestId,
    requestedBy: displayNameOf(session),
    job: created.job,
    jobDetails: job?.description ?? null,
    gc: job?.gc ?? null,
    toDo: values.toDo,
    weAre: values.weAre,
    delivery: values.delivery,
    pickup: values.pickup,
    floor: values.floor,
    contact: values.contact,
    contactPhone: values.contactPhone,
    fieldPm: values.fieldPm,
    start: newYorkInstant(values.day, values.slotHour).toISOString(),
    timeRange: values.timeRange,
    notes: values.notes,
    tools: values.tools,
    toolsNotes: values.toolsNotes,
  }

  const notified = await notifyNewRequest(
    notification,
    buildSummary(notification)
  )
  if (!notified.sent && notified.reason === "failed") {
    warnings.push(`The WhatsApp notification did not go out: ${notified.error}`)
  }

  revalidatePath("/requests")

  return {
    status: "created",
    requestId: created.requestId,
    job: created.job,
    warning: warnings.length ? warnings.join(" ") : null,
  }
}
