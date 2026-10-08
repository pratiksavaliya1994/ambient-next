import { RequestMaterialSlot } from "@/components/request-material-slot"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  effectiveQty,
  lineProgress,
  type LineContext,
  type MaterialLine,
} from "@/lib/bubble/requested-materials-types"
import type { LineTripRow } from "@/lib/bubble/trip-materials-types"

/**
 * A request's materials on its detail page: each structured line as requested
 * · assigned · where its units are on trips (`RequestMaterialSlot`, laid out
 * like the tools card's slots so both read the same), and below
 * them the legacy free-text note when the request has one. `listMaterialLines`
 * never returns both for one request — the legacy row beside new lines is
 * dropped on read — so in practice this shows one or the other.
 *
 * A pickup's lines are "Materials to collect". They need no approval, so the
 * header just counts them (5G).
 *
 * Renders nothing when the request has no materials at all.
 */
export function RequestMaterialsCard({
  lines,
  legacy,
  tripRows = [],
  context,
  sourceJobs,
}: {
  lines: MaterialLine[]
  legacy: string[]
  /** The lines' `tripmaterial` rows, from `listTripMaterialsForLines` — what `lineProgress` counts. Linked transfers' rows too. */
  tripRows?: readonly LineTripRow[]
  /** The request's direction, and the transfers feeding a delivery's lines (5F). */
  context?: LineContext
  /** Pickup request id → job, naming the sites a delivery's linked transfers come from. */
  sourceJobs?: ReadonlyMap<string, string>
}) {
  if (lines.length === 0 && legacy.length === 0) return null

  const pickup = context?.pickup ?? false
  const full = lines.filter(
    (line) => line.assignedQty + lineProgress(line, tripRows, context).linkedCoverage >= effectiveQty(line)
  ).length

  return (
    <Card data-size="sm">
      <CardHeader>
        <CardTitle className="text-base">{pickup ? "Materials to collect" : "Materials"}</CardTitle>
        <span className="text-sm text-muted-foreground tabular-nums">
          {lines.length > 0
            ? pickup
              ? `${lines.length} ${lines.length === 1 ? "line" : "lines"}`
              : `${full} of ${lines.length} ${lines.length === 1 ? "line" : "lines"} fully assigned`
            : `${legacy.length} ${legacy.length === 1 ? "line" : "lines"}`}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lines.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-lg border">
            {lines.map((line) => (
              <RequestMaterialSlot
                key={line.id}
                line={line}
                tripRows={tripRows}
                context={context}
                sourceJobs={sourceJobs}
              />
            ))}
          </ul>
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
