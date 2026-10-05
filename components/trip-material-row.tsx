"use client"

import { CargoKindIcon, CargoSectionLabel } from "@/components/cargo-kind"
import { MaterialKindBadge } from "@/components/material-line-row"
import { QuantityStepper } from "@/components/quantity-stepper"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import type { OutstandingMaterial } from "@/lib/trips/material-movement-types"
import { cn } from "@/lib/utils"

/**
 * A request's material lines in the builder's pool, under its tools.
 *
 * Kept apart from `TripMovementRow`, which is tool-shaped: a line has no
 * condition to block on, but it has a quantity, and part of a delivery line
 * can go on this trip. A pickup line goes whole (5F).
 */
export function TripMaterialList({
  materials,
  quantities,
  onToggle,
  onQtyChange,
}: {
  materials: readonly OutstandingMaterial[]
  /** `lineId → qty for this trip`. A line is ticked when it has an entry. */
  quantities: ReadonlyMap<string, number>
  onToggle: (line: OutstandingMaterial, checked: boolean) => void
  onQtyChange: (lineId: string, qty: number) => void
}) {
  if (materials.length === 0) return null

  return (
    <div className="flex flex-col gap-1 border-t border-dashed p-2">
      <CargoSectionLabel kind="material" count={materials.length} />
      <ul className="flex flex-col gap-1">
        {materials.map((line) => (
          <TripMaterialRow
            key={line.lineId}
            line={line}
            qty={quantities.get(line.lineId)}
            onCheckedChange={(checked) => onToggle(line, checked)}
            onQtyChange={(qty) => onQtyChange(line.lineId, qty)}
          />
        ))}
      </ul>
    </div>
  )
}

/**
 * One line: checkbox · name · kind · "**8** of 12 left", and a stepper once
 * ticked. The stepper runs `1..outstanding` and starts at all of it.
 *
 * A **pickup** line (`fixedQty`) has no stepper: it goes on one trip whole,
 * its estimate reading "about 10 bag", and the driver counts it at the stop.
 * A **linked** one also carries a "→ Site B" badge — its destination is fixed
 * by the transfer, whatever the group's warehouse says.
 *
 * The whole row toggles, as `TripMovementRow` does, so the checkbox and the
 * stepper stop their clicks reaching it.
 */
export function TripMaterialRow({
  line,
  qty,
  onCheckedChange,
  onQtyChange,
}: {
  line: OutstandingMaterial
  /** This trip's quantity, or `undefined` when the line isn't ticked. */
  qty: number | undefined
  onCheckedChange: (checked: boolean) => void
  onQtyChange: (qty: number) => void
}) {
  const checked = qty !== undefined
  const unit = line.unit ? ` ${line.unit}` : ""
  const transfer = line.fixedQty && line.fixedDestination

  return (
    <li
      onClick={() => onCheckedChange(!checked)}
      // Dashed and tinted where a tool row is solid and plain, so the two kinds
      // stay apart at a glance even once both are ticked.
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-md border border-l-4 border-dashed border-material/40 px-2 py-1.5 transition-colors",
        checked ? "border-l-primary bg-primary/5" : "border-l-material bg-material/5 hover:bg-material/10"
      )}
    >
      <span className="mt-0.5 flex shrink-0" onClick={(event) => event.stopPropagation()}>
        <Checkbox checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} aria-label={line.name} />
      </span>
      <CargoKindIcon kind="material" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-xs font-medium" title={line.name}>
            {line.name}
          </p>
          {transfer && (
            <Badge variant="outline" className="max-w-[45%] shrink-0 truncate px-1.5 py-0 text-[10px]" title={line.to}>
              → {line.to}
            </Badge>
          )}
          <MaterialKindBadge kind={line.kind} className="shrink-0 px-1.5 py-0 text-[10px] font-normal" />
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          {line.fixedQty ? (
            <span className="tabular-nums">
              about <span className="font-semibold text-foreground">{line.outstanding}</span>
              {unit} · goes whole
            </span>
          ) : (
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{line.outstanding}</span> of {line.assigned}
              {unit} left
            </span>
          )}
          {checked && !line.fixedQty && (
            <span onClick={(event) => event.stopPropagation()}>
              <QuantityStepper value={qty} min={1} max={line.outstanding} onChange={onQtyChange} label={line.name} />
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
