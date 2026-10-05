import { CheckIcon } from "lucide-react"

import { MaterialLineRow, quantityLabel } from "@/components/material-line-row"
import { MaterialLineTripProgress } from "@/components/material-line-trip-progress"
import { LinkedSupplyRows, PickupLineProgress } from "@/components/request-material-progress"
import { Badge } from "@/components/ui/badge"
import {
  effectiveQty,
  lineProgress,
  type LineContext,
  type MaterialLine,
} from "@/lib/bubble/requested-materials-types"
import type { LineTripRow } from "@/lib/bubble/trip-materials-types"
import type { TripFlag } from "@/lib/trips/plan-types"

/**
 * One material line on the request page.
 *
 * - **Delivery:** assigned against requested, with what linked pickups at
 *   other sites are bringing counted in, how far it has got on trips, and a
 *   sub-row per linked pickup.
 * - **Pickup (5G):** the estimate, where it's going, and what was collected
 *   and returned. No approval state — a pickup's lines need none.
 */
export function RequestMaterialLine({
  line,
  tripRows,
  context,
  flag,
  sourceJobs,
}: {
  line: MaterialLine
  /** The request's lines' trip rows, plus their linked transfers' rows. */
  tripRows: readonly LineTripRow[]
  context?: LineContext
  flag?: TripFlag
  /** Pickup request id → job, for naming a delivery's linked sources. */
  sourceJobs?: ReadonlyMap<string, string>
}) {
  if (context?.pickup) {
    return (
      <MaterialLineRow
        line={line}
        meta={
          <>
            <AssignedMeta line={line} pickup />
            <PickupLineProgress line={line} rows={tripRows} flag={flag} />
          </>
        }
      />
    )
  }

  const progress = lineProgress(line, tripRows, context)
  return (
    <div className="flex flex-col gap-1">
      <MaterialLineRow
        line={line}
        meta={
          <>
            <AssignedMeta line={line} coverage={progress.linkedCoverage} />
            <MaterialLineTripProgress progress={progress} flag={flag} />
          </>
        }
      />
      <LinkedSupplyRows line={line} linked={context?.linked ?? []} rows={tripRows} jobs={sourceJobs} />
    </div>
  )
}

/**
 * `12 of 20 bag`, plus how it stands: "short" once some but not all is
 * assigned, "not assigned" before anything is. Units linked pickups are
 * bringing (`coverage`, 5F) count toward full. A non-inventory line is
 * approved whole or not at all, so it reads as approved or awaiting. A pickup
 * line just reads its estimate: it needs no approval.
 */
export function AssignedMeta({
  line,
  pickup = false,
  coverage = 0,
}: {
  line: MaterialLine
  pickup?: boolean
  coverage?: number
}) {
  const requested = effectiveQty(line)

  if (pickup) {
    const label = quantityLabel(line)
    return <span className="tabular-nums">{line.quantity !== null ? `about ${label}` : label}</span>
  }

  if (line.kind === "NonInventory") {
    return (
      <>
        <span className="tabular-nums">{quantityLabel(line)}</span>
        {line.assignedQty >= requested ? <ApprovedBadge /> : <Badge variant="outline">Awaiting approval</Badge>}
      </>
    )
  }

  const short = requested - coverage - line.assignedQty
  return (
    <>
      <span className="tabular-nums">
        {line.assignedQty} of {requested} {line.unit ?? ""}
      </span>
      {coverage > 0 && <span className="tabular-nums">· ~{coverage} from pickups</span>}
      {short <= 0 ? (
        <ApprovedBadge label="Assigned" />
      ) : line.assignedQty + coverage > 0 ? (
        <Badge className="border-transparent bg-status-attention/15 text-status-attention-foreground">{short} short</Badge>
      ) : (
        <Badge variant="outline">Not assigned</Badge>
      )}
    </>
  )
}

function ApprovedBadge({ label = "Approved" }: { label?: string }) {
  return (
    <Badge className="border-transparent bg-status-ok/15 text-status-ok-foreground">
      <CheckIcon />
      {label}
    </Badge>
  )
}
