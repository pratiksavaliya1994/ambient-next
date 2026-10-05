import { ArrowRightLeftIcon, PackageXIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { effectiveQty, isLinkedTransfer, type MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { TripMaterialRow } from "@/lib/bubble/trip-materials-types"
import { pickupLineReport } from "@/lib/materials/pickup-line-report"
import type { TripFlag } from "@/lib/trips/plan-types"

const LINK = "font-medium text-foreground underline-offset-2 hover:underline"

/**
 * A pickup line's journey on the request page (5G §4): where it's going — the
 * warehouse, or "→ Site B" for a transfer, linking to that delivery — then
 * what the driver **collected** and where it **landed**. A transfer the site
 * turned away says so instead. **Not picked up** flags a line the last trip
 * left behind; it's back in the builder's pool.
 */
export function PickupLineProgress({
  line,
  rows,
  flag,
}: {
  line: MaterialLine
  rows: readonly TripMaterialRow[]
  flag?: TripFlag
}) {
  const report = pickupLineReport(line, rows)
  const linked = isLinkedTransfer(line)

  return (
    <>
      {report.refusedAt ? (
        <span className="font-medium text-status-attention-foreground">
          · refused at {report.refusedAt} — {report.backAtYard ? "back at the warehouse" : "on its way back"}
        </span>
      ) : linked ? (
        <Link href={`/requests/${line.transferToRequestId}`} className={LINK}>
          → {line.transferToLocation}
        </Link>
      ) : (
        <span>to the warehouse</span>
      )}
      {report.counted !== null && <span className="tabular-nums">· collected {report.counted}</span>}
      {report.landedAt && report.counted !== null && (
        <span className="tabular-nums">
          · {linked && report.landedAt === line.transferToLocation ? `delivered ${report.counted}` : `returned ${report.counted}`}
        </span>
      )}
      {flag === "skipped" && (
        <Badge className="border-transparent bg-status-attention text-white">
          <PackageXIcon />
          Not picked up
        </Badge>
      )}
    </>
  )
}

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
            {report.landedAt === supply.transferToLocation && report.counted !== null && (
              <span className="tabular-nums">· delivered {report.counted}</span>
            )}
            {report.refusedAt && <span className="text-status-attention-foreground">· refused here</span>}
          </li>
        )
      })}
    </ul>
  )
}
