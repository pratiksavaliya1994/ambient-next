/**
 * Site-to-site transfers (5F §2.6) — the shapes the delivery's assign page
 * reads. Client-safe, beside the `server-only` reads in `material-transfers.ts`.
 *
 * A transfer is a **pickup** line at one job linked to a **delivery** line for
 * the same catalogue item at another. The pickup line carries the link; the
 * delivery line knows nothing of it, so every read of coverage starts from
 * `transferToLineID`.
 */

/** A pickup line that could feed a delivery line, or already does. */
export type TransferSource = {
  pickupLineId: string
  pickupRequestId: string
  materialId: string
  name: string
  unit: string | null
  /** The job it would be collected from. */
  job: string
  /** The pickup's `requestDateStart`. */
  start: string | null
  /** The PM's estimate — `effectiveQty`. The driver's count replaces it. */
  estimate: number
  /** The delivery line it's linked to, `""` when unlinked. */
  linkedToLineId: string
}

/** The three `transferTo…` fields, set together. `null` clears them. */
export type TransferLink = { lineId: string; requestId: string; location: string }
