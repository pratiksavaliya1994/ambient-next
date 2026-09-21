import "server-only"

import type { RequestStopInfo } from "@/lib/bubble/requests"
import type { StopWork, Trip, TripToolRow } from "@/lib/bubble/trips-types"

/**
 * Which half of a stop's work an item belongs to. **No `refused` case here** —
 * unlike the on-screen run sheet, the PDF is a plan for a driver with no app
 * access, not a record of what already happened, so it never shows a stop's
 * `refused` list or any per-item outcome.
 */
export type PdfItemTone = "collect" | "drop"

/**
 * The distinct requests a stop's items point back to, in first-seen order.
 *
 * A job site normally serves one request, but a warehouse stop can carry
 * items for several — so the PDF (which has no popover to look one up in)
 * shows the contact block only when there is exactly one, and falls back to
 * naming the job per tool line otherwise. See `pdf-stop-block.tsx`. Only
 * `collect`/`drop` are considered, matching what the PDF actually prints —
 * a request that shows up solely on this stop's hidden `refused` list would
 * otherwise print a contact block for nothing.
 */
export function stopRequests(work: StopWork, requests: ReadonlyMap<string, RequestStopInfo>): RequestStopInfo[] {
  const seen = new Set<string>()
  const list: RequestStopInfo[] = []
  for (const item of [...work.collect, ...work.drop]) {
    if (!item.requestId) continue
    const request = requests.get(item.requestId)
    if (!request || seen.has(request.id)) continue
    seen.add(request.id)
    list.push(request)
  }
  return list
}

/**
 * The far end of an item's journey: where a collect is headed, or where a
 * drop came from.
 *
 * A drop riding back to the warehouse after being turned away still reads
 * `from <the site that turned it away>` — that's `toLocation`, the one field
 * that keeps pointing at the refusing site (see `TripToolRow`) — worded
 * exactly like an ordinary drop's origin, with nothing to say this one is a
 * returned refusal rather than a first delivery.
 */
export function journeyLabel(item: TripToolRow, tone: PdfItemTone): string | null {
  const sentBack = tone === "drop" && (item.state === "Refused" || item.state === "Returned")
  const location = tone === "collect" || sentBack ? item.toLocation : item.fromLocation
  if (!location) return null
  return tone === "collect" ? `to ${location}` : `from ${location}`
}

/** File name for the download — the driver and the date, so a folder of these sorts sensibly. */
export function tripPdfFileName(trip: Trip): string {
  const day = trip.tripDate?.slice(0, 10) ?? "undated"
  const driver = (trip.driver ?? "unassigned").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return `trip-${day}-${driver}.pdf`
}
