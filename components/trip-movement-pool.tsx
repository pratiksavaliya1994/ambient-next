"use client"

import { useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"

import { TripMovementGroup } from "@/components/trip-movement-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import type { RequestMovements } from "@/lib/trips/movement-types"

/**
 * Everything waiting to be moved, grouped by request.
 *
 * This replaces the old board's list of whole requests, and the difference is
 * the point: a checkbox here is **one physical tool**, so a request can be
 * split across two trucks, two drivers or two days without anything being
 * forced to travel together that doesn't need to.
 *
 * The search is over tool and job names together, since a manager looking for
 * "the grinder for Greenwich" may be holding either half of that.
 */
export function TripMovementPool({
  groups,
  selectedIds,
  destinations,
  journeys,
  onToggle,
  onToggleGroup,
  onDestinationChange,
}: {
  groups: RequestMovements[]
  selectedIds: ReadonlySet<string>
  destinations: ReadonlyMap<string, string>
  /** `toolId → where the current selection really sends it`. See `TripMovementRow`. */
  journeys: ReadonlyMap<string, string>
  onToggle: (toolId: string, checked: boolean) => void
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
        return movements.length > 0 ? { ...group, movements } : null
      })
      .filter((group): group is RequestMovements => group !== null)
  }, [groups, query])

  if (groups.length === 0) {
    return (
      <Empty className="border border-dashed py-10">
        <EmptyHeader>
          <EmptyTitle>Nothing waiting</EmptyTitle>
          <EmptyDescription>
            Every assigned tool has reached where it was going. Assign tools to a request to see them here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <InputGroup>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools or jobs"
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

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
            destination={destinations.get(group.requestId) ?? group.destination}
            journeys={journeys}
            onToggle={onToggle}
            onToggleAll={(checked) => onToggleGroup(group, checked)}
            onDestinationChange={(warehouse) => onDestinationChange(group.requestId, warehouse)}
          />
        ))
      )}
    </div>
  )
}
