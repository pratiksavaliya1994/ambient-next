import type { MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { TripMaterialRow } from "@/lib/bubble/trip-materials-types"

/**
 * What has happened to one pickup line (5F) so far, for the request page —
 * read off its trip rows that got past the collect. Client-safe and pure.
 *
 * `Skipped` rows are left out (the line went back to the pool), and so are
 * `Planned` ones (nothing has happened yet). An unlinked line can be split
 * across trips (2026-10-06), so the counts are summed over its rows; a linked
 * transfer goes on one trip whole, so its newest row is the whole story of a
 * refusal.
 */
export type PickupLineReport = {
  /** What the driver counted at the collects, summed, once they have. */
  counted: number | null
  /** What has landed — at the yard, or a transfer's site — summed. */
  landed: number
  /** Where it last landed, once it has. */
  landedAt: string | null
  /**
   * The site that turned a transfer away, once one has. The row's
   * `toLocation` keeps pointing at that site after a refusal.
   */
  refusedAt: string | null
  /** A refused transfer has been unloaded at the yard. */
  backAtYard: boolean
}

const NOTHING_YET: PickupLineReport = { counted: null, landed: 0, landedAt: null, refusedAt: null, backAtYard: false }

export function pickupLineReport(line: Pick<MaterialLine, "id">, rows: readonly TripMaterialRow[]): PickupLineReport {
  const decided = rows.filter((row) => row.lineId === line.id && row.state !== "Planned" && row.state !== "Skipped")
  const latest = decided.at(-1)
  if (!latest) return NOTHING_YET

  const counts = decided.flatMap((row) => (row.actualQty === null ? [] : [row.actualQty]))
  const dropped = decided.filter((row) => row.state === "Dropped")
  const refused = latest.state === "Refused" || latest.state === "Returned"
  return {
    counted: counts.length > 0 ? counts.reduce((sum, qty) => sum + qty, 0) : null,
    landed: dropped.reduce((sum, row) => sum + (row.actualQty ?? 0), 0),
    landedAt: dropped.at(-1)?.toLocation ?? null,
    refusedAt: refused ? latest.toLocation : null,
    backAtYard: latest.state === "Returned",
  }
}
