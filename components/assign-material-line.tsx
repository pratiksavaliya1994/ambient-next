"use client"

import { CheckIcon } from "lucide-react"
import type * as React from "react"

import { MaterialLineRow, quantityLabel } from "@/components/material-line-row"
import { QuantityStepper } from "@/components/quantity-stepper"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { effectiveQty, type MaterialLine } from "@/lib/bubble/requested-materials-types"

/**
 * One line on the assign card.
 *
 * **Inventory:** "requested 20 · in stock 12", a stepper held to the bounds
 * `useMaterialTargets` works out, and "Fill from stock" to jump to the most
 * that can go. Short stock is not a blocker — the line reads "partial — 8
 * short" and Save still goes ahead; that's the partial-assign rule.
 *
 * **Non-inventory:** Approve / Approved. There's no stock behind it, so it's
 * all of the line or none — the action refuses anything in between.
 */
export function AssignMaterialLine({
  line,
  target,
  min,
  max,
  stockQty,
  warehouseLocation,
  drawsStock,
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
  /** Whether assigning this line takes units off the shelf — `holdsStock`. */
  drawsStock: boolean
  onChange: (next: number) => void
}) {
  const requested = effectiveQty(line)

  if (line.kind === "NonInventory") {
    const approved = target >= requested
    return (
      <MaterialLineRow
        line={line}
        meta={
          <>
            <RequestedQty>{quantityLabel(line)}</RequestedQty>
            <OnTrips count={min} />
          </>
        }
        actions={
          <Button
            type="button"
            size="sm"
            variant={approved ? "secondary" : "outline"}
            aria-pressed={approved}
            // Once any of it is on a truck, un-approving would strand it.
            disabled={approved && min > 0}
            onClick={() => onChange(approved ? 0 : requested)}
          >
            {approved && <CheckIcon />}
            {approved ? "Approved" : "Approve"}
          </Button>
        }
      />
    )
  }

  const short = requested - target
  return (
    <MaterialLineRow
      line={line}
      meta={
        <>
          <RequestedQty>
            {requested} {line.unit?.trim()}
          </RequestedQty>
          {drawsStock && stockQty !== null && <span className="tabular-nums">in stock {stockQty}</span>}
          {warehouseLocation && <span>· {warehouseLocation}</span>}
          {target >= requested ? (
            <Badge className="border-transparent bg-status-ok/15 text-status-ok-foreground">Full</Badge>
          ) : target > 0 ? (
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
            {drawsStock ? "Fill from stock" : "Fill"}
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
function RequestedQty({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-foreground ring-1 ring-primary/25 ring-inset">
      <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">Requested</span>
      <span className="text-sm font-semibold tabular-nums">{children}</span>
    </span>
  )
}

/** The floor, when there is one: units on trips can't be unassigned from here. */
function OnTrips({ count }: { count: number }) {
  if (count === 0) return null
  return <span className="tabular-nums">· {count} on trips</span>
}
