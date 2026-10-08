"use client"

import * as React from "react"

import { InTransitDriverCard } from "@/components/in-transit-driver-card"
import { useElementWidth } from "@/hooks/use-element-width"
import type { InTransitLoad } from "@/lib/trips/in-transit"
import type { DriverGroup } from "@/lib/trips/in-transit-filters"
import { balancedColumns } from "@/lib/tools/masonry"

const COLUMN_WIDTH_PX = 256 // Tailwind's `3xs`, same as the other dashboards
const COLUMN_GAP_PX = 4 // `gap-1`
const HEADER_HEIGHT_PX = 32
const TRIP_LINE_HEIGHT_PX = 16
const DESTINATION_HEIGHT_PX = 20
const ROW_HEIGHT_PX = 22
const CARD_GAP_PX = 4

function estimateHeight(group: DriverGroup) {
  return (
    HEADER_HEIGHT_PX +
    (group.tripIds.length > 0 ? TRIP_LINE_HEIGHT_PX : 0) +
    group.destinations.length * DESTINATION_HEIGHT_PX +
    (group.toolCount + group.materialCount) * ROW_HEIGHT_PX +
    CARD_GAP_PX
  )
}

/**
 * `WarehouseMasonryGrid`'s layout for driver cards: columns balanced by
 * estimated height, and no scroll cap on a card — a truck's whole load stays
 * visible on a wall screen rather than hiding behind an inner scrollbar.
 */
export function InTransitMasonryGrid({ groups, trips }: { groups: DriverGroup[]; trips: InTransitLoad["trips"] }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef)
  const columnCount = Math.max(1, Math.floor((width + COLUMN_GAP_PX) / (COLUMN_WIDTH_PX + COLUMN_GAP_PX)))
  const columns = balancedColumns(groups, groups.map(estimateHeight), columnCount)

  return (
    <div
      ref={containerRef}
      className="grid items-start gap-1"
      style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}
    >
      {columns.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-col gap-1">
          {column.map((group) => (
            <InTransitDriverCard key={group.driver} group={group} trips={trips} />
          ))}
        </div>
      ))}
    </div>
  )
}
