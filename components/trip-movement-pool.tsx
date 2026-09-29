"use client"

import { useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"

import { TripMovementGroup } from "@/components/trip-movement-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import type { OutstandingMaterial } from "@/lib/trips/material-movement-types"
import type { RequestMovements } from "@/lib/trips/movement-types"

/**
 * Everything waiting to be moved, grouped by request.
 *
 * This replaces the old board's list of whole requests, and the difference is
 * the point: a checkbox here is **one physical tool**, or **some of one
 * material line**, so a request can be split across two trucks, two drivers or
 * two days without anything being forced to travel together that doesn't need
 * to.
 *
 * The search is over tool, material and job names together, since a manager
 * looking for "the grinder for Greenwich" may be holding either half of that.
 */
export function TripMovementPool({
  groups,
  selectedIds,
  materialQty,
  destinations,
  journeys,
  onToggle,
  onToggleMaterial,
  onMaterialQtyChange,
  onToggleGroup,
  onDestinationChange,
}: {
  groups: RequestMovements[]
  selectedIds: ReadonlySet<string>
  /** `lineId → qty for this trip`. */
  materialQty: ReadonlyMap<string, number>
  destinations: ReadonlyMap<string, string>
  /** `toolId → where the current selection really sends it`. See `TripMovementRow`. */
  journeys: ReadonlyMap<string, string>
  onToggle: (toolId: string, checked: boolean) => void
  onToggleMaterial: (line: OutstandingMaterial, checked: boolean) => void
  onMaterialQtyChange: (lineId: string, qty: number) => void
  onToggleGroup: (group: RequestMovements, checked: boolean) => void
  onDestinationChange: (requestId: string, warehouse: string) => void
}) {
  const [query, setQuery] = useState("")

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return groups
    return groups
      .map((group) => {
        // A job-name match keeps the whole group — the manager is looking for
        // the request, not one tool in it.
        if (group.job.toLowerCase().includes(needle)) return group
        const movements = group.movements.filter((movement) => movement.toolName.toLowerCase().includes(needle))
        const materials = group.materials.filter((line) => line.name.toLowerCase().includes(needle))
        return movements.length + materials.length > 0 ? { ...group, movements, materials } : null
      })
      .filter((group): group is RequestMovements => group !== null)
  }, [groups, query])

  if (groups.length === 0) {
    return (
      <Empty className="border border-dashed py-10">
        <EmptyHeader>
          <EmptyTitle>Nothing waiting</EmptyTitle>
          <EmptyDescription>
            Every assigned tool and material has reached where it was going. Assign some to a request to see them here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools, materials or jobs"
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      <SelectionCount tools={selectedIds.size} materials={materialQty.size} />

      {visible.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>Try a different search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        visible.map((group) => (
          <TripMovementGroup
            key={group.requestId}
            group={group}
            selectedIds={selectedIds}
            materialQty={materialQty}
            destination={destinations.get(group.requestId) ?? group.destination}
            journeys={journeys}
            onToggle={onToggle}
            onToggleMaterial={onToggleMaterial}
            onMaterialQtyChange={onMaterialQtyChange}
            onToggleAll={(checked) => onToggleGroup(group, checked)}
            onDestinationChange={(warehouse) => onDestinationChange(group.requestId, warehouse)}
          />
        ))
      )}
    </div>
  )
}

/** "3 tools · 2 materials selected" — what the pool has ticked, across every group. */
function SelectionCount({ tools, materials }: { tools: number; materials: number }) {
  if (tools + materials === 0) return <p className="text-xs text-muted-foreground">Nothing selected yet.</p>

  const parts = [
    tools > 0 && `${tools} ${tools === 1 ? "tool" : "tools"}`,
    materials > 0 && `${materials} ${materials === 1 ? "material" : "materials"}`,
  ].filter(Boolean)

  return <p className="text-xs text-muted-foreground tabular-nums">{parts.join(" · ")} selected</p>
}
