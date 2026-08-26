import { newYorkWeekday } from "@/lib/bubble/dates"
import type { ToolLine } from "@/lib/bubble/tools-summary"

/**
 * The WhatsApp summary text for a new request. Composing it is the only part
 * of notifying that lives in Next.js — sending it is the `new-request`
 * Bubble backend workflow's job (see `lib/bubble/requests.ts`), since that
 * workflow is what has WhatsApp/Whapi credentials configured.
 */

export type NotificationInput = {
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
  end: string
  timeRange: string
  notes: string
  tools: readonly ToolLine[]
  toolsNotes: string
  materials: string
}

/**
 * Real newlines, not escaped ones — `JSON.stringify` escapes them correctly on
 * the way out, and hand-escaping here produces a literal `\n` in the message.
 */
export function buildSummary(input: NotificationInput): string {
  const movement = [input.delivery && "Delivery", input.pickup && "Pickup"].filter(Boolean).join(" + ")

  const startDay = newYorkWeekday(input.start)
  const endDay = newYorkWeekday(input.end)
  const dateLine = startDay === endDay ? startDay : `${startDay} – ${endDay}`

  const lines = [
    `New ${input.delivery ? "Delivery" : "Pickup"} Request from ${input.requestedBy}`,
    "",
    `Address: ${input.job}`,
    input.jobDetails ? `Details: ${input.jobDetails}` : null,
    input.gc ? `GC: ${input.gc}` : null,
    `We Are: ${input.weAre}`,
    input.floor ? `Floor: ${input.floor}` : null,
    `Contact: ${input.contact}${input.contactPhone ? ` Phone no: ${input.contactPhone}` : ""}`,
    `Date: ${dateLine}`,
    `Range of time: ${input.timeRange}`,
    input.notes ? `Notes: ${input.notes}` : null,
    `Field PM: ${input.fieldPm}`,
    "",
    "Tools:",
    ...input.tools.map((tool) => ` ${tool.name}: ${tool.quantity}`),
    input.toolsNotes ? `\nTool notes: ${input.toolsNotes}` : null,
    input.materials ? `\nmaterial :\n ${input.materials}` : null,
  ]

  return lines.filter((line) => line !== null).join("\n")
}
