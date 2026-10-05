"use client"

import { CheckIcon } from "lucide-react"

import { OnTrips, RequestedQty } from "@/components/assign-material-line"
import { MaterialLineRow, quantityLabel } from "@/components/material-line-row"
import { Button } from "@/components/ui/button"
import { effectiveQty, type MaterialLine } from "@/lib/bubble/requested-materials-types"

/**
 * A **non-inventory** delivery line: approved whole or not at all. There's no
 * stock behind it, so there's nothing to step through, and the action refuses
 * anything in between.
 *
 * Pickup lines never get here — they need no approval and count as assigned
 * from the moment the request is created, the way a pickup's tools do.
 */
export function AssignApproveLine({
  line,
  target,
  min,
  onChange,
}: {
  line: MaterialLine
  target: number
  /** What's already on trips — `boundsOf(line).min`. */
  min: number
  onChange: (next: number) => void
}) {
  const requested = effectiveQty(line)
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
