import type { MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { TripMaterialRow } from "@/lib/bubble/trip-materials-types"

/**
 * What has happened to one pickup line (5F) so far, for the request page —
 * read off its newest trip row that got past the collect. Client-safe and pure.
 *
 * A pickup line goes on **one trip, whole**, so the newest decided row is the
 * whole story: `Skipped` rows are left out (the line went back to the pool),
 * and so are `Planned` ones (nothing has happened yet).
 */
export type PickupLineReport = {
  /** What the driver counted at the collect, once they have. */
  counted: number | null
  /** Where it landed — the yard, or a transfer's site — once it has. */
  landedAt: string | null
  /**
   * The site that turned a transfer away, once one has. The row's
   * `toLocation` keeps pointing at that site after a refusal.
   */
  refusedAt: string | null
  /** A refused transfer has been unloaded at the yard. */
  backAtYard: boolean
}

const NOTHING_YET: PickupLineReport = { counted: null, landedAt: null, refusedAt: null, backAtYard: false }

export function pickupLineReport(line: Pick<MaterialLine, "id">, rows: readonly TripMaterialRow[]): PickupLineReport {
  const decided = rows.filter((row) => row.lineId === line.id && row.state !== "Planned" && row.state !== "Skipped")
  const latest = decided.at(-1)
  if (!latest) return NOTHING_YET

  const refused = latest.state === "Refused" || latest.state === "Returned"
  return {
    counted: latest.actualQty ?? null,
    landedAt: latest.state === "Dropped" ? latest.toLocation : null,
    refusedAt: refused ? latest.toLocation : null,
    backAtYard: latest.state === "Returned",
  }
}
