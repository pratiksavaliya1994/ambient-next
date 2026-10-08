import { CheckIcon } from "lucide-react"

import { quantityLabel } from "@/components/material-line-row"
import { Badge } from "@/components/ui/badge"
import { effectiveQty, type MaterialLine } from "@/lib/bubble/requested-materials-types"

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
