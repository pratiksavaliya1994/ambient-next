import { CargoKindIcon } from "@/components/cargo-kind"
import { MaterialKindBadge } from "@/components/material-line-row"
import { StateChip, type StopItemTone } from "@/components/trip-stop-item-line"
import type { MaterialKind } from "@/lib/bubble/requested-materials-types"
import {
  isPickupMaterial,
  isTransferMaterial,
  materialQtyLabel,
  pickupQtyLabel,
} from "@/lib/bubble/trip-materials-types"
import type { TripToolState } from "@/lib/trips/plan-types"
import { cn } from "@/lib/utils"

/**
 * One material line at a stop — typed structurally, as `StopItem` is, because
 * both `PlannedMaterial` (the builder's preview) and `TripMaterialRow` (the run
 * sheet) flow through here.
 */
export type StopMaterial = {
  lineId: string
  name: string
  /** Planned for this trip. */
  qty: number
  /** What was actually loaded, once it was. Shown over `qty` when set. */
  actualQty?: number | null
  unit: string
  kind: MaterialKind | null
  fromLocation?: string
  toLocation?: string
  state?: TripToolState
}

/**
 * name · **qty + unit** · kind · state chip, and the far end of the journey on
 * wider screens — the tool line's layout, with the quantity where a tool shows
 * its type. The chip is the tool one, so "Done", "Refused" and "Back at yard"
 * read the same for both kinds of cargo.
 *
 * No checkbox here: as for tools, ticking and unticking live in the stop's
 * checklist (`TripStopActions`), and this line is the record.
 *
 * A **pickup** line (5G) shows its estimate as "about 10 bag" until the driver
 * counts it. A **transfer** reads "→ Site B" where it's collected and "from
 * Site A · 6 counted" where it lands.
 */
export function TripStopMaterialLine({ material, tone }: { material: StopMaterial; tone: StopItemTone }) {
  const spent = material.state === "Skipped" || tone === "refused"
  const sentBack = tone === "drop" && (material.state === "Refused" || material.state === "Returned")
  const elsewhere = tone === "collect" || sentBack ? material.toLocation : material.fromLocation
  const pickup = isPickupMaterial(material)
  const transfer = isTransferMaterial(material)

  return (
    // Tinted and edged in the material accent, with the quantity in a pill —
    // a tool line beside it is plain, so the two kinds never read alike.
    <li
      className={cn(
        "flex items-center gap-2 border-l-4 border-l-material px-2 py-1.5",
        spent ? "bg-status-attention/5" : "bg-material/5"
      )}
    >
      <CargoKindIcon kind="material" />
      <span
        className={cn("min-w-0 truncate text-xs font-medium", spent && "text-muted-foreground line-through")}
        title={material.name}
      >
        {material.name}
      </span>
      <span className="shrink-0 rounded bg-material/15 px-1.5 py-0.5 text-[11px] font-semibold text-material-foreground tabular-nums">
        {pickup ? pickupQtyLabel(material) : materialQtyLabel(material)}
      </span>
      {material.kind && (
        <MaterialKindBadge kind={material.kind} className="hidden shrink-0 px-1.5 py-0 text-[10px] font-normal sm:flex" />
      )}

      {elsewhere && (
        <span
          className="ml-auto hidden max-w-[40%] shrink-0 truncate text-[11px] text-muted-foreground sm:inline"
          title={elsewhere}
        >
          {tone === "collect" ? (transfer ? "→ " : "to ") : sentBack ? "refused by " : "from "}
          {elsewhere}
          {transfer && tone === "drop" && !sentBack && material.actualQty != null && ` · ${material.actualQty} counted`}
        </span>
      )}

      <StateChip state={material.state} />
    </li>
  )
}
