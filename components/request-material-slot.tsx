import Link from "next/link"

import { MaterialKindBadge, quantityLabel } from "@/components/material-line-row"
import { LinkedSupplyRows } from "@/components/request-material-progress"
import { TripStateRow } from "@/components/trip-state-row"
import {
  effectiveQty,
  isLinkedTransfer,
  lineProgress,
  type LineContext,
  type MaterialLine,
} from "@/lib/bubble/requested-materials-types"
import type { LineTripRow } from "@/lib/bubble/trip-materials-types"
import { lineTripChunks, type LineChunk } from "@/lib/materials/line-trip-states"
import { cn } from "@/lib/utils"

/**
 * One material line on the request page, laid out like a requested tool type
 * (`RequestToolSlots`): the line and its assigned-against-requested pill on
 * top, and nested under it its units by trip state (`lineTripChunks`) in the
 * tool rows' own colours and flags (`TripStateRow`) — so "2 gal on the truck"
 * and a tool on the truck look the same at every step of the lifecycle.
 *
 * A delivery line fed by pickups at other sites lists them below (5F).
 */
export function RequestMaterialSlot({
  line,
  tripRows,
  context,
  sourceJobs,
}: {
  line: MaterialLine
  /** The request's lines' trip rows, plus their linked transfers' rows. */
  tripRows: readonly LineTripRow[]
  context?: LineContext
  /** Pickup request id → job, for naming a delivery's linked sources. */
  sourceJobs?: ReadonlyMap<string, string>
}) {
  const pickup = context?.pickup ?? false
  const coverage = pickup ? 0 : lineProgress(line, tripRows, context).linkedCoverage
  const chunks = lineTripChunks(line, tripRows, pickup)

  return (
    <li className="flex flex-col gap-2 bg-muted/40 px-3 py-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold wrap-anywhere">{line.name}</span>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <MaterialKindBadge kind={line.kind} />
            {pickup && <Destination line={line} />}
            {coverage > 0 && <span className="tabular-nums">~{coverage} from pickups at other sites</span>}
          </div>
        </div>
        <LinePill line={line} pickup={pickup} coverage={coverage} />
      </div>

      {chunks.length > 0 ? (
        <ul className="flex flex-col gap-1.5 border-l-2 border-muted-foreground/25 pl-3">
          {chunks.map((chunk, index) => (
            <TripStateRow
              key={index}
              state={chunk.state}
              title={<span className="tabular-nums">{chunkTitle(line, chunk, pickup)}</span>}
              detail={chunk.detail}
            />
          ))}
        </ul>
      ) : (
        !pickup &&
        coverage === 0 && (
          <p className="border-l-2 border-status-attention/50 pl-3 text-xs font-medium text-status-attention-foreground">
            {line.kind === "NonInventory" ? "Awaiting approval — nothing to send yet" : "Nothing assigned yet for this line"}
          </p>
        )
      )}

      <LinkedSupplyRows line={line} linked={context?.linked ?? []} rows={tripRows} jobs={sourceJobs} />
    </li>
  )
}

/**
 * The tool slot's "1 assigned · 1 requested" pill, for a material line: green
 * once the line is covered, amber while it is short. A pickup line needs no
 * approval, so it is covered from the start and just reads its estimate.
 */
function LinePill({ line, pickup, coverage }: { line: MaterialLine; pickup: boolean; coverage: number }) {
  const requested = effectiveQty(line)
  const covered = pickup || line.assignedQty + coverage >= requested
  const label = pickup
    ? line.quantity !== null
      ? `about ${quantityLabel(line)}`
      : quantityLabel(line)
    : line.kind === "NonInventory"
      ? `${covered ? "Approved" : "Awaiting approval"} · ${quantityLabel(line)}`
      : `${line.assignedQty} assigned · ${requested}${line.unit ? ` ${line.unit}` : ""} requested`

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
        covered
          ? "bg-status-ok/15 text-status-ok-foreground"
          : "bg-status-attention/15 text-status-attention-foreground"
      )}
    >
      {label}
    </span>
  )
}

/** Where a pickup line is headed: the warehouse, or "→ Site B" linking to that delivery. */
function Destination({ line }: { line: MaterialLine }) {
  if (!isLinkedTransfer(line)) return <span>to the warehouse</span>
  return (
    <Link
      href={`/requests/${line.transferToRequestId}`}
      className="font-medium text-foreground underline-offset-2 hover:underline"
    >
      → {line.transferToLocation}
    </Link>
  )
}

/** `2 gal`, "about" while a pickup's units are still the PM's estimate, "One lot" for a line with no quantity. */
function chunkTitle(line: MaterialLine, chunk: LineChunk, pickup: boolean): string {
  if (line.quantity === null) return "One lot"
  const estimate = pickup && (chunk.state === "pending-pickup" || chunk.state === "left-behind")
  return [estimate ? "about" : null, chunk.qty, line.unit?.trim()].filter(Boolean).join(" ")
}
