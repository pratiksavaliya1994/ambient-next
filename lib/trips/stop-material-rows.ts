import {
  isPickupMaterial,
  isTransferMaterial,
  materialQtyLabel,
  pickupQtyLabel,
  type TripMaterialRow,
} from "@/lib/bubble/trip-materials-types"
import type { StopKind } from "@/lib/trips/plan-types"

/**
 * How one material line reads in a stop's checklist and its confirm dialog —
 * split from `stop-checklist.ts`, which decides *what* is sent, so that file
 * stays about the lists.
 *
 * The quantity leads ("20 bag Level-Flor"), since it's what the driver is
 * counting. A pickup line (5F/5G) reads its estimate as "about" until it's
 * counted, and the dialog says what each outcome does: a count above the
 * estimate, a zero, a transfer's next stop, what goes back into stock.
 */

/** One row of a checklist or of the confirm summary — a tool or a material line, alike. */
export type StopRow = {
  id: string
  label: string
  detail?: string
  kind: "tool" | "material"
  /** Shown under the row in the confirm dialog, on every screen size — what this outcome means. */
  note?: { text: string; tone: "warn" | "info" }
}

/** Which bucket of the confirm summary the row is in. */
export type StopBucket = "toCollect" | "canRefuse" | "loaded" | "skipped" | "dropped" | "refused"

const info = (text: string): StopRow["note"] => ({ text, tone: "info" })
const warn = (text: string): StopRow["note"] => ({ text, tone: "warn" })

/**
 * A material line as a `StopRow` for one bucket. `count` is what the driver
 * typed for a pickup line being collected here; `stop` is where we are.
 */
export function materialStopRow(
  row: TripMaterialRow,
  bucket: StopBucket,
  stop: { kind: StopKind; location: string },
  count?: number
): StopRow {
  const base = { id: row.lineId, kind: "material" as const }
  const pickup = isPickupMaterial(row)
  const unit = row.unit.trim()

  // Collected here: a pickup line reads its count, measured against the estimate.
  if (pickup && (bucket === "loaded" || bucket === "skipped") && count !== undefined) {
    if (bucket === "skipped") return { ...base, label: `${row.name}`, note: warn("Counted 0 — not collected") }
    const then = isTransferMaterial(row) ? info(`then to ${row.toLocation}`) : undefined
    const over = count > row.qty ? warn(`${count} — more than the ${row.qty} expected`) : undefined
    return { ...base, label: [count, unit, row.name].filter(Boolean).join(" "), note: over ?? then }
  }

  // A transfer arriving at its site: what was counted at the other end.
  if (pickup && stop.kind === "Job" && (bucket === "dropped" || bucket === "refused" || bucket === "canRefuse")) {
    const label = `${row.name} from ${row.fromLocation} · ${materialQtyLabel(row)} counted`
    if (bucket === "refused") return { ...base, label, note: warn("Refused — goes back to the warehouse") }
    if (bucket === "dropped") return { ...base, label, note: info(`+${materialQtyLabel(row)} to ${stop.location}`) }
    return { ...base, label }
  }

  // Unloaded at the yard: an inventory pickup line goes back into stock.
  if (pickup && stop.kind === "Warehouse" && bucket === "dropped") {
    const note =
      row.kind === "Inventory" ? info(`+${materialQtyLabel(row)} ${row.name} to stock`) : info("Back at the yard")
    return { ...base, label: `${materialQtyLabel(row)} ${row.name}`, note }
  }

  return { ...base, label: `${pickup ? pickupQtyLabel(row) : materialQtyLabel(row)} ${row.name}` }
}
