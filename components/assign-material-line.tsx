"use client"

import type * as React from "react"

import { MaterialLineRow } from "@/components/material-line-row"
import { QuantityStepper } from "@/components/quantity-stepper"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { effectiveQty, type MaterialLine } from "@/lib/bubble/requested-materials-types"

/**
 * One **inventory delivery** line on the assign card: "requested 20 · in
 * stock 12", a stepper held to the bounds `useMaterialTargets` works out, and
 * "Fill from stock" to jump to the most that can go. Short stock is not a
 * blocker — the line reads "partial — 8 short" and Save still goes ahead;
 * that's the partial-assign rule.
 *
 * **Coverage (5F/5G):** units linked pickups at other sites are bringing read
 * "from pickups ~6 · from stock 4". They come off the bound, so "Fill" fills
 * only what the transfers don't cover, and "short" counts them as on their way.
 *
 * A non-inventory line is approve-only: `AssignApproveLine`. Pickup lines
 * never reach the assign page — they need no approval.
 */
export function AssignMaterialLine({
  line,
  target,
  min,
  max,
  stockQty,
  warehouseLocation,
  coverage,
  onChange,
}: {
  line: MaterialLine
  target: number
  min: number
  max: number
  /** The item's stock as the page read it; `null` when there's no item behind the line. */
  stockQty: number | null
  /** The item's shelf/bin in the warehouse; `null` when unset or there's no item. */
  warehouseLocation: string | null
  /** Units linked pickups are bringing — `lineProgress().linkedCoverage`. */
  coverage: number
  onChange: (next: number) => void
}) {
  const requested = effectiveQty(line)
  const short = requested - coverage - target

  return (
    <MaterialLineRow
      line={line}
      meta={
        <>
          <RequestedQty>
            {requested} {line.unit?.trim()}
          </RequestedQty>
          {stockQty !== null && <span className="tabular-nums">in stock {stockQty}</span>}
          {warehouseLocation && <span>· {warehouseLocation}</span>}
          {coverage > 0 && (
            <span className="font-medium text-foreground tabular-nums">
              · from pickups ~{coverage} · from stock {target}
            </span>
          )}
          {short <= 0 ? (
            <Badge className="border-transparent bg-status-ok/15 text-status-ok-foreground">Full</Badge>
          ) : target + coverage > 0 ? (
            <Badge className="border-transparent bg-status-attention/15 text-status-attention-foreground">
              partial — {short} short
            </Badge>
          ) : (
            max < requested && <Badge variant="outline">only {max} available</Badge>
          )}
          <OnTrips count={min} />
        </>
      }
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" disabled={target === max} onClick={() => onChange(max)}>
            Fill from stock
          </Button>
          <QuantityStepper value={target} min={min} max={max} label={line.name} onChange={onChange} />
        </>
      }
    />
  )
}

/**
 * What was asked for, set apart from the muted meta around it: it's the number
 * the stepper is being measured against, so it has to read at a glance.
 */
export function RequestedQty({ children, label = "Requested" }: { children: React.ReactNode; label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-foreground ring-1 ring-primary/25 ring-inset">
      <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{children}</span>
    </span>
  )
}

/** The floor, when there is one: units on trips can't be unassigned from here. */
export function OnTrips({ count }: { count: number }) {
  if (count === 0) return null
  return <span className="tabular-nums">· {count} on trips</span>
}
