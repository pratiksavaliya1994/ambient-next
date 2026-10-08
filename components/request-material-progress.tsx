import { ArrowRightLeftIcon } from "lucide-react"
import Link from "next/link"

import { effectiveQty, type MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { TripMaterialRow } from "@/lib/bubble/trip-materials-types"
import { pickupLineReport } from "@/lib/materials/pickup-line-report"

const LINK = "font-medium text-foreground underline-offset-2 hover:underline"

/**
 * Under a delivery line, one sub-row per pickup linked to it (5G §4): "From
 * Site A pickup: about 6 · collected 6 · delivered 6". The site links to that
 * pickup. Renders nothing when no pickup feeds the line.
 */
export function LinkedSupplyRows({
  line,
  linked,
  rows,
  jobs,
}: {
  line: MaterialLine
  /** Any superset of the pickup lines linked to this request's lines. */
  linked: readonly MaterialLine[]
  rows: readonly TripMaterialRow[]
  /** Pickup request id → its job. */
  jobs?: ReadonlyMap<string, string>
}) {
  const supplies = linked.filter((supply) => supply.transferToLineId === line.id)
  if (supplies.length === 0) return null
  const unit = line.unit ? ` ${line.unit}` : ""

  return (
    <ul className="ml-3 flex flex-col gap-1 border-l-2 border-dashed border-material/40 py-0.5 pl-3">
      {supplies.map((supply) => {
        const report = pickupLineReport(supply, rows)
        return (
          <li key={supply.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowRightLeftIcon className="size-3" />
            <span>
              From{" "}
              <Link href={`/requests/${supply.requestId}`} className={LINK}>
                {jobs?.get(supply.requestId) ?? "another site"}
              </Link>{" "}
              pickup:
            </span>
            <span className="tabular-nums">
              about {effectiveQty(supply)}
              {unit}
            </span>
            {report.counted !== null && <span className="tabular-nums">· collected {report.counted}</span>}
            {report.landedAt === supply.transferToLocation && (
              <span className="tabular-nums">· delivered {report.landed}</span>
            )}
            {report.refusedAt && <span className="text-status-attention-foreground">· refused here</span>}
          </li>
        )
      })}
    </ul>
  )
}
