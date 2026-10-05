"use client"

import { AlertCircleIcon } from "lucide-react"

import { AssignApproveLine } from "@/components/assign-approve-line"
import { AssignMaterialLine } from "@/components/assign-material-line"
import { AssignTransferSources } from "@/components/assign-transfer-sources"
import { MaterialLineRow } from "@/components/material-line-row"
import { AssignedMeta } from "@/components/request-material-line"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ItemGroup } from "@/components/ui/item"
import type { useMaterialTargets } from "@/hooks/use-material-targets"
import type { TransferSource } from "@/lib/bubble/material-transfer-types"
import { effectiveQty, holdsStock, type MaterialLine } from "@/lib/bubble/requested-materials-types"

/**
 * What the page hands the assign screen for its materials: the lines with
 * their live stock and trip floors, or — when that read failed — the lines and
 * why, so a slow or broken stock read costs the materials card and not the
 * whole screen.
 */
export type AssignMaterialsData =
  | {
      lines: MaterialLine[]
      stock: Record<string, number>
      /** Item id → its warehouse location, for items that have one. */
      shelves: Record<string, string>
      floors: Record<string, number>
      /** Delivery line id → units linked pickups are bringing (5F). */
      coverage: Record<string, number>
      /** Pickup lines at other sites that could feed this delivery's lines, or already do. */
      sources: TransferSource[]
      pickup: boolean
      /** Closed requests render read-only, as the tools do. */
      readOnly: boolean
    }
  | { lines: MaterialLine[]; error: string }

/**
 * The assign screen's Materials card. It holds no state and has no Save of its
 * own: the draft is `useMaterialTargets`, owned by `AssignToolsPanel`, and the
 * one Save there sends tools and materials together.
 *
 * Each inventory line also lists the pickups at other sites that could feed it
 * — those links write on their own, not on Save. Only a delivery gets here: a
 * pickup's lines need no approval, and its assign page redirects.
 */
export function AssignMaterialsCard({
  data,
  draft,
}: {
  data: AssignMaterialsData
  draft: ReturnType<typeof useMaterialTargets>
}) {
  if ("error" in data) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Couldn&rsquo;t load the materials&rsquo; stock</AlertTitle>
        <AlertDescription>{data.error} Reload the page to try again.</AlertDescription>
      </Alert>
    )
  }

  const { lines, readOnly } = data
  const full = lines.filter((line) => draft.targetOf(line) + (data.coverage[line.id] ?? 0) >= effectiveQty(line)).length

  return (
    <Card data-size="sm">
      <CardHeader>
        <CardTitle className="text-base">Materials</CardTitle>
        <CardDescription className="tabular-nums">
          {full} of {lines.length} {lines.length === 1 ? "line" : "lines"} fully assigned
          {readOnly && " · request closed"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-1.5">
          {lines.map((line) =>
            readOnly ? (
              <MaterialLineRow key={line.id} line={line} meta={<AssignedMeta line={line} />} />
            ) : (
              <EditableLine key={line.id} line={line} data={data} draft={draft} />
            )
          )}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

function EditableLine({
  line,
  data,
  draft,
}: {
  line: MaterialLine
  data: Extract<AssignMaterialsData, { stock: unknown }>
  draft: ReturnType<typeof useMaterialTargets>
}) {
  const { min, max } = draft.boundsOf(line)
  const onChange = (next: number) => draft.setTarget(line.id, next)

  if (!holdsStock(line, data)) {
    return <AssignApproveLine line={line} target={draft.targetOf(line)} min={min} onChange={onChange} />
  }

  const materialId = line.materialId ?? ""
  return (
    <div className="flex flex-col gap-1">
      <AssignMaterialLine
        line={line}
        target={draft.targetOf(line)}
        min={min}
        max={max}
        stockQty={data.stock[materialId] ?? null}
        warehouseLocation={data.shelves[materialId] ?? null}
        coverage={data.coverage[line.id] ?? 0}
        onChange={onChange}
      />
      <AssignTransferSources
        deliveryLineId={line.id}
        need={effectiveQty(line) - line.assignedQty - (data.coverage[line.id] ?? 0)}
        sources={data.sources.filter(
          (source) =>
            source.materialId === line.materialId && (source.linkedToLineId === "" || source.linkedToLineId === line.id)
        )}
      />
    </div>
  )
}
