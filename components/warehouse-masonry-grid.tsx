"use client"

import * as React from "react"

import { WarehouseTypeCard } from "@/components/warehouse-type-card"
import { useElementWidth } from "@/hooks/use-element-width"
import { balancedColumns } from "@/lib/tools/masonry"
import type { WarehouseTypeGroup } from "@/lib/tools/warehouse-filters"

const COLUMN_WIDTH_PX = 256 // Tailwind's `3xs`, same as the `columns-3xs` this replaces
const COLUMN_GAP_PX = 4 // `gap-1`
const HEADER_HEIGHT_PX = 32
const ROW_HEIGHT_PX = 22
const CARD_GAP_PX = 4

function estimateHeight(group: WarehouseTypeGroup) {
  return HEADER_HEIGHT_PX + group.tools.length * ROW_HEIGHT_PX + CARD_GAP_PX
}

/**
 * Replaces CSS multi-column (`columns-3xs`) for this grid: multi-column
 * forces every column to the same height, so one type held in bulk sets the
 * height for the whole row and every lighter column sits empty underneath it.
 * This measures the container and buckets groups by estimated height instead,
 * so each column ends up near the same total.
 */
export function WarehouseMasonryGrid({ groups }: { groups: WarehouseTypeGroup[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef)
  const columnCount = Math.max(1, Math.floor((width + COLUMN_GAP_PX) / (COLUMN_WIDTH_PX + COLUMN_GAP_PX)))
  const weights = groups.map(estimateHeight)
  const columns = balancedColumns(groups, weights, columnCount)

  return (
    <div
      ref={containerRef}
      className="grid items-start gap-1"
      style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}
    >
      {columns.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-col gap-1">
          {column.map((group) => (
            <WarehouseTypeCard key={group.typeName} typeName={group.typeName} tools={group.tools} />
          ))}
        </div>
      ))}
    </div>
  )
}
