"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TOOL_CONDITION } from "@/lib/bubble/tool-enums"
import { ALL_FILTER_VALUE } from "@/lib/tools/list-filters"
import { warehouseHref, type WarehouseListParams } from "@/lib/tools/warehouse-filters"

type FilterKey = "condition"

/** One dropdown for one filter axis — committed immediately on pick, same
 *  idiom as `ToolsListSelectFilters`' `FilterSelect`. Not shared with it: the
 *  param shape differs (two axes here, not four) and the duplication is a
 *  couple of lines wide. */
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
  current: WarehouseListParams
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
        startTransition(() => router.push(warehouseHref({ [filterKey]: next }, current)))
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

/** The Warehouse dashboard's whole toolbar: condition, plus a "Clear filters"
 *  link once it's set. No status select — a tool at the warehouse is always
 *  `Available` or `Assigned`, every other `statusNew` value is impossible
 *  there, so status isn't a useful filter axis. No type or location select
 *  either — type is the grouping axis and location is fixed to the warehouse
 *  by definition. */
export function WarehouseDashboardFilters({ current }: { current: WarehouseListParams }) {
  const hasFilters = current.condition !== ALL_FILTER_VALUE

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        ariaLabel="Condition"
        allLabel="All conditions"
        filterKey="condition"
        options={[...TOOL_CONDITION]}
        current={current}
      />
      {hasFilters && (
        <Link href="/tools/warehouse" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Clear filters
        </Link>
      )}
    </div>
  )
}
