"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TOOL_CONDITION, TOOL_STATUS_LIFECYCLE_FILTER } from "@/lib/bubble/tool-enums"
import { ALL_FILTER_VALUE, toolsListHref, type ToolsListParams } from "@/lib/tools/list-filters"

type FilterKey = "type" | "status" | "condition" | "location"

/** One dropdown for one filter axis — committed immediately on pick (unlike
 *  the name search, a `Select` choice is a discrete action, not something to
 *  debounce), preserving every other filter and resetting `page` to 1. */
function FilterSelect({
  ariaLabel,
  allLabel,
  filterKey,
  options,
  current,
}: {
  ariaLabel: string
  allLabel: string
  filterKey: FilterKey
  options: string[]
  current: ToolsListParams
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const items = [{ label: allLabel, value: ALL_FILTER_VALUE }, ...options.map((value) => ({ label: value, value }))]

  return (
    <Select
      items={items}
      value={current[filterKey]}
      onValueChange={(next) => {
        if (next === null) return
        startTransition(() => router.push(toolsListHref({ [filterKey]: next }, current)))
      }}
    >
      <SelectTrigger aria-label={ariaLabel} size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="w-fit min-w-(--anchor-width)">
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** The type/status/condition/location row, plus a "Clear filters" link that
 *  only appears once something is actually narrowed down. */
export function ToolsListSelectFilters({
  current,
  typeOptions,
  locationOptions,
}: {
  current: ToolsListParams
  typeOptions: string[]
  locationOptions: string[]
}) {
  const hasFilters =
    current.type !== ALL_FILTER_VALUE ||
    current.status !== ALL_FILTER_VALUE ||
    current.condition !== ALL_FILTER_VALUE ||
    current.location !== ALL_FILTER_VALUE ||
    current.q.trim() !== ""

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect ariaLabel="Type" allLabel="All types" filterKey="type" options={typeOptions} current={current} />
      <FilterSelect
        ariaLabel="Status"
        allLabel="All statuses"
        filterKey="status"
        options={[...TOOL_STATUS_LIFECYCLE_FILTER]}
        current={current}
      />
      <FilterSelect
        ariaLabel="Condition"
        allLabel="All conditions"
        filterKey="condition"
        options={[...TOOL_CONDITION]}
        current={current}
      />
      <FilterSelect
        ariaLabel="Location"
        allLabel="All locations"
        filterKey="location"
        options={locationOptions}
        current={current}
      />
      {hasFilters && (
        <Link href="/tools/all" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Clear filters
        </Link>
      )}
    </div>
  )
}
