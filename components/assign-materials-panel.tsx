"use client"

import { AlertCircleIcon } from "lucide-react"

import { AssignMaterialLine } from "@/components/assign-material-line"
import { MaterialLineRow } from "@/components/material-line-row"
import { AssignedMeta } from "@/components/request-materials-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ItemGroup } from "@/components/ui/item"
import type { useMaterialTargets } from "@/hooks/use-material-targets"
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
      pickup: boolean
      /** Closed requests render read-only, as the tools do. */
      readOnly: boolean
    }
  | { lines: MaterialLine[]; error: string }

/**
 * The assign screen's Materials card. It holds no state and has no Save of its
 * own: the draft is `useMaterialTargets`, owned by `AssignToolsPanel`, and the
 * one Save there sends tools and materials together.
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

  const { lines, stock, shelves, pickup, readOnly } = data
  const { targetOf, boundsOf, setTarget } = draft
  const full = lines.filter((line) => targetOf(line) >= effectiveQty(line)).length

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
              <AssignMaterialLine
                key={line.id}
                line={line}
                target={targetOf(line)}
                {...boundsOf(line)}
                stockQty={line.materialId ? (stock[line.materialId] ?? null) : null}
                warehouseLocation={line.materialId ? (shelves[line.materialId] ?? null) : null}
                drawsStock={holdsStock(line, { pickup })}
                onChange={(next) => setTarget(line.id, next)}
              />
            )
          )}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}
