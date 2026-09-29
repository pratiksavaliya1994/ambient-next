import "server-only"

import type { Trip, TripToolRow } from "@/lib/bubble/trips-types"

/**
 * Which half of a stop's work an item belongs to. **No `refused` case here** —
 * unlike the on-screen run sheet, the PDF is a plan for a driver with no app
 * access, not a record of what already happened, so it never shows a stop's
 * `refused` list or any per-item outcome.
 */
export type PdfItemTone = "collect" | "drop"

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
export function journeyLabel(
  item: Pick<TripToolRow, "fromLocation" | "toLocation" | "state">,
  tone: PdfItemTone
): string | null {
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
