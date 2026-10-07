"use client"

import { useState } from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { DateRangePicker } from "@/components/date-range-picker"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { isOpenRequest, REQUEST_STATUS, type RequestStatus } from "@/lib/bubble/enums"

export type MovementFilter = "all" | "delivery" | "pickup"

export type ActiveFilters = {
  text: string
  status: RequestStatus | "all"
  movement: MovementFilter
  /** `yyyy-mm-dd`, inclusive, on the drop/pickup date. Blank means unbounded. */
  from: string
  to: string
}

export const NO_ACTIVE_FILTERS: ActiveFilters = { text: "", status: "all", movement: "all", from: "", to: "" }

const STATUS_ITEMS = [
  { label: "All statuses", value: "all" },
  ...REQUEST_STATUS.filter(isOpenRequest).map((status) => ({ label: status, value: status })),
]

/**
 * The Active tab's filter controls. Unlike the All tab's search bar, every
 * control applies as it changes — the whole active list is already in the
 * browser, so there is nothing to fetch and no Search button to press.
 */
export function ActiveRequestFilterBar({
  filters,
  onChange,
}: {
  filters: ActiveFilters
  onChange: (next: ActiveFilters) => void
}) {
  // Bumped only to remount `DateRangePicker` so it forgets its own internal
  // range when the dates are cleared — it re-syncs from props only on open.
  const [dateResetKey, setDateResetKey] = useState(0)
  const set = (patch: Partial<ActiveFilters>) => onChange({ ...filters, ...patch })

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
      <InputGroup className="min-w-0 flex-1 basis-64">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={filters.text}
          onChange={(event) => set({ text: event.target.value })}
          placeholder="Filter by job, PM, contact or floor"
        />
        {filters.text && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="button" size="icon-xs" aria-label="Clear filter text" onClick={() => set({ text: "" })}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Select
          items={STATUS_ITEMS}
          value={filters.status}
          onValueChange={(next) => set({ status: (next ?? "all") as ActiveFilters["status"] })}
        >
          <SelectTrigger aria-label="Status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STATUS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[filters.movement]}
          onValueChange={(next) => next[0] && set({ movement: next[0] as MovementFilter })}
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="delivery">Delivery</ToggleGroupItem>
          <ToggleGroupItem value="pickup">Pickup</ToggleGroupItem>
        </ToggleGroup>

        <ButtonGroup>
          <ButtonGroupText className="text-muted-foreground">Drop / pickup</ButtonGroupText>
          <DateRangePicker
            key={dateResetKey}
            className="w-auto max-w-full"
            placeholder="Any date"
            startDate={filters.from}
            endDate={filters.to}
            onRangeChange={(next) => set({ from: next.startDate, to: next.endDate })}
          />
          {(filters.from || filters.to) && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Clear dates"
              onClick={() => {
                set({ from: "", to: "" })
                setDateResetKey((key) => key + 1)
              }}
            >
              <XIcon />
            </Button>
          )}
        </ButtonGroup>
      </div>
    </div>
  )
}
