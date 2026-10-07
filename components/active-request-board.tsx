"use client"

import { Fragment, useState } from "react"

import { ActiveRequestFilterBar, NO_ACTIVE_FILTERS, type ActiveFilters } from "@/components/active-request-filters"
import { RequestGrid } from "@/components/request-grid"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { RequestStatus } from "@/lib/bubble/enums"

/**
 * One active request as the board needs it: the card already rendered on the
 * server, plus just enough plain data to filter it here. `haystack` is the
 * lower-cased job, PM, contact and floor — the same four fields the All tab's
 * server search sweeps. `day` is the New York drop/pickup day as `yyyy-mm-dd`,
 * or null when the row has no date at all.
 */
export type ActiveRequestItem = {
  id: string
  card: React.ReactNode
  haystack: string
  status: RequestStatus
  delivery: boolean
  pickup: boolean
  day: string | null
}

function matches(item: ActiveRequestItem, filters: ActiveFilters) {
  const text = filters.text.trim().toLowerCase()
  if (text && !item.haystack.includes(text)) return false
  if (filters.status !== "all" && item.status !== filters.status) return false
  if (filters.movement === "delivery" && !item.delivery) return false
  if (filters.movement === "pickup" && !item.pickup) return false
  if (filters.from || filters.to) {
    if (!item.day) return false
    if (filters.from && item.day < filters.from) return false
    if (filters.to && item.day > filters.to) return false
  }
  return true
}

/** The Active tab: every active request is already here, filtered in the browser. */
export function ActiveRequestBoard({ items }: { items: ActiveRequestItem[] }) {
  const [filters, setFilters] = useState(NO_ACTIVE_FILTERS)
  // Bumped to remount the filter bar, so "Clear filters" also clears the date
  // picker's own internal range.
  const [resetKey, setResetKey] = useState(0)

  const shown = items.filter((item) => matches(item, filters))
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_ACTIVE_FILTERS)
  const clear = () => {
    setFilters(NO_ACTIVE_FILTERS)
    setResetKey((key) => key + 1)
  }

  return (
    <div className="flex flex-col gap-4">
      <ActiveRequestFilterBar key={resetKey} filters={filters} onChange={setFilters} />

      <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {filtering
            ? `Showing ${shown.length} of ${items.length} active requests`
            : `${items.length} active ${items.length === 1 ? "request" : "requests"}`}
        </span>
        {filtering && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No matching requests</EmptyTitle>
            <EmptyDescription>No active request matches these filters.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={clear}>
              Clear filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <RequestGrid>
          {shown.map((item) => (
            <Fragment key={item.id}>{item.card}</Fragment>
          ))}
        </RequestGrid>
      )}
    </div>
  )
}
