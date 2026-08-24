import "server-only"

import { newYorkWeekday } from "@/lib/bubble/dates"
import { bubbleCreate } from "@/lib/bubble/client"
import type { ToolLine } from "@/lib/bubble/tools-summary"

/**
 * The WhatsApp summary the old Bubble app sends on every new request, plus the
 * `Notifications` row its "resend last message" button reads back.
 *
 * **Both are off unless `NOTIFY_ON_CREATE=true`.** The group id in the
 * environment is a real, live WhatsApp group and the Bubble page workflow
 * still sends its own copy, so turning this on without first disabling the
 * Bubble-side send means every request notifies twice. Composing the text is
 * always safe and always runs; only the two side effects are gated.
 */

const WHAPI_URL = "https://gate.whapi.cloud/messages/text"

export type NotificationInput = {
  requestId: string
  requestedBy: string
  job: string
  jobDetails: string | null
  gc: string | null
  toDo: string
  weAre: string
  delivery: boolean
  pickup: boolean
  floor: string
  contact: string
  contactPhone: string
  fieldPm: string
  start: string
  timeRange: string
  notes: string
  tools: readonly ToolLine[]
  toolsNotes: string
}

/**
 * Real newlines, not escaped ones — `JSON.stringify` escapes them correctly on
 * the way out, and hand-escaping here produces a literal `\n` in the message.
 */
export function buildSummary(input: NotificationInput): string {
  const movement = [input.delivery && "Delivery", input.pickup && "Pickup"]
    .filter(Boolean)
    .join(" + ")

  const lines = [
    `New request from ${input.requestedBy}`,
    "",
    `${input.toDo} (${movement})`,
    `Address: ${input.job}`,
    input.jobDetails ? `Details: ${input.jobDetails}` : null,
    input.gc ? `GC: ${input.gc}` : null,
    `We Are: ${input.weAre}`,
    input.floor ? `Floor: ${input.floor}` : null,
    `Contact: ${input.contact}${input.contactPhone ? ` Phone no: ${input.contactPhone}` : ""}`,
    `Date: ${newYorkWeekday(input.start)}`,
    `Range of time: ${input.timeRange}`,
    input.notes ? `Notes: ${input.notes}` : null,
    `Field PM: ${input.fieldPm}`,
    "",
    "Tools:",
    ...input.tools.map((tool) => ` ${tool.name}: ${tool.quantity}`),
    input.toolsNotes ? `\nTool notes: ${input.toolsNotes}` : null,
  ]

  return lines.filter((line) => line !== null).join("\n")
}

export function notificationsEnabled(): boolean {
  return process.env.NOTIFY_ON_CREATE === "true"
}

export type NotifyResult =
  | { sent: false; reason: "disabled" }
  | { sent: false; reason: "failed"; error: string }
  | { sent: true }

/**
 * Writes the `Notifications` row and sends the WhatsApp message. Never throws:
 * a request that saved but failed to notify is still a saved request, and the
 * caller reports the difference rather than rolling anything back.
 */
export async function notifyNewRequest(
  input: NotificationInput,
  summary: string
): Promise<NotifyResult> {
  if (!notificationsEnabled()) return { sent: false, reason: "disabled" }

  const token = process.env.WHAPI_TOKEN
  const group = process.env.WHAPI_GROUP_ID
  if (!token || !group) {
    return {
      sent: false,
      reason: "failed",
      error: "WHAPI_TOKEN / WHAPI_GROUP_ID are not set.",
    }
  }

  try {
    await bubbleCreate("notifications", {
      request: input.requestId,
      summary,
      status: "Sent",
    })

    const response = await fetch(WHAPI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ typing_time: 6, to: group, body: summary }),
    })
    if (!response.ok) {
      return {
        sent: false,
        reason: "failed",
        error: `Whapi replied ${response.status}.`,
      }
    }

    return { sent: true }
  } catch (error) {
    return {
      sent: false,
      reason: "failed",
      error: error instanceof Error ? error.message : "Unknown error.",
    }
  }
}
