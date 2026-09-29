import { CheckIcon } from "lucide-react"

import { MaterialLineRow, quantityLabel } from "@/components/material-line-row"
import { MaterialLineTripProgress } from "@/components/material-line-trip-progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ItemGroup } from "@/components/ui/item"
import { effectiveQty, lineProgress, type MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { LineTripRow } from "@/lib/bubble/trip-materials-types"
import type { TripFlag } from "@/lib/trips/plan-types"

/**
 * A request's materials on its detail page: each structured line as requested
 * · assigned · how far it has got on trips, and below them the legacy
 * free-text note when the request has one. `listMaterialLines` never returns
 * both for one request — the legacy row `new-request` writes beside new lines
 * is dropped on read — so in practice this shows one or the other.
 *
 * Renders nothing when the request has no materials at all.
 */
export function RequestMaterialsCard({
  lines,
  legacy,
  tripRows = [],
  flags,
}: {
  lines: MaterialLine[]
  legacy: string[]
  /** The lines' `tripmaterial` rows, from `listTripMaterialsForLines` — what `lineProgress` counts. */
  tripRows?: readonly LineTripRow[]
  /** `lineId → what the last trip decided`, from `lineTripFlags`. */
  flags?: ReadonlyMap<string, TripFlag>
}) {
  if (lines.length === 0 && legacy.length === 0) return null

  const assigned = lines.filter((line) => line.assignedQty >= effectiveQty(line)).length

  return (
    <Card data-size="sm">
      <CardHeader>
        <CardTitle className="text-base">Materials</CardTitle>
        <span className="text-sm text-muted-foreground tabular-nums">
          {lines.length > 0
            ? `${assigned} of ${lines.length} ${lines.length === 1 ? "line" : "lines"} fully assigned`
            : `${legacy.length} ${legacy.length === 1 ? "line" : "lines"}`}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lines.length > 0 && (
          <ItemGroup className="gap-1.5">
            {lines.map((line) => (
              <MaterialLineRow
                key={line.id}
                line={line}
                meta={
                  <>
                    <AssignedMeta line={line} />
                    <MaterialLineTripProgress progress={lineProgress(line, tripRows)} flag={flags?.get(line.id)} />
                  </>
                }
              />
            ))}
          </ItemGroup>
        )}

        {legacy.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Materials (legacy note)
            </span>
            <ul className="divide-y overflow-hidden rounded-lg border">
              {legacy.map((text, index) => (
                <li key={index} className="px-3 py-2 text-sm wrap-anywhere">
                  {text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * `12 of 20 bag`, plus how it stands: "short" once some but not all is
 * assigned, "not assigned" before anything is. A non-inventory line is
 * approved whole or not at all, so it reads as approved or awaiting.
 */
export function AssignedMeta({ line }: { line: MaterialLine }) {
  const requested = effectiveQty(line)
  const full = line.assignedQty >= requested

  if (line.kind === "NonInventory") {
    return (
      <>
        <span className="tabular-nums">{quantityLabel(line)}</span>
        {full ? <ApprovedBadge /> : <Badge variant="outline">Awaiting approval</Badge>}
      </>
    )
  }

  return (
    <>
      <span className="tabular-nums">
        {line.assignedQty} of {requested} {line.unit ?? ""}
      </span>
      {full ? (
        <ApprovedBadge label="Assigned" />
      ) : line.assignedQty > 0 ? (
        <Badge className="border-transparent bg-status-attention/15 text-status-attention-foreground">
          {requested - line.assignedQty} short
        </Badge>
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
