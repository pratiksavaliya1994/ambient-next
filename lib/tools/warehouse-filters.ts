import { isWarehouseDestination } from "@/lib/bubble/enums"
import type { DashboardTool } from "@/lib/bubble/pickup-tools-types"
import { ALL_FILTER_VALUE } from "@/lib/tools/list-filters"

/**
 * Pure filtering/grouping helpers for the Warehouse dashboard — every tool
 * currently at the warehouse, grouped by tool type rather than by location
 * (every row here already shares the same location, so grouping by it would
 * show nothing). Same pure, client-safe idiom as `list-filters.ts`.
 *
 * "At the warehouse" is the strict destination check (`isWarehouseDestination`
 * — `tools.location === "Warehouse"`), not the lenient `isWarehouseLocation`
 * dispatch/collect code uses. That one also treats a blank `location` as
 * "close enough to skip a collect stop," which is the right call for planning
 * a trip but wrong here: a tool with no location set hasn't been confirmed to
 * physically be on site, and this dashboard would be lying if it said so.
 */

/** Grouping bucket for a tool whose `type` link didn't resolve to a name —
 *  display-only, same convention as `NO_LOCATION`. */
export const NO_TOOL_TYPE = "No tool type"

export type WarehouseListParams = {
  condition: string
}

export type WarehouseRawParams = {
  condition?: string
}

export function parseWarehouseParams(raw: WarehouseRawParams): WarehouseListParams {
  return {
    condition: raw.condition ?? ALL_FILTER_VALUE,
  }
}

function matches(value: string, filter: string): boolean {
  return filter === ALL_FILTER_VALUE || value === filter
}

/** Warehouse tools matching the current condition filter. A tool at the
 *  warehouse is always `Available` or `Assigned` — every other `statusNew`
 *  value implies it's out on a job or a trip — so status isn't a useful
 *  filter axis here and isn't offered. */
export function filterWarehouseTools(tools: DashboardTool[], filters: WarehouseListParams): DashboardTool[] {
  return tools.filter((tool) => {
    if (!isWarehouseDestination(tool.location)) return false
    if (!matches(tool.condition, filters.condition)) return false
    return true
  })
}

export type WarehouseTypeGroup = { typeName: string; tools: DashboardTool[] }

/** Groups by `typeName`, sorted alphabetically with `NO_TOOL_TYPE` last —
 *  the one card that can't be identified by name earns the least prominent spot. */
export function groupByToolType(tools: DashboardTool[]): WarehouseTypeGroup[] {
  const byType = new Map<string, DashboardTool[]>()
  for (const tool of tools) {
    const key = tool.typeName ?? NO_TOOL_TYPE
    const bucket = byType.get(key)
    if (bucket) bucket.push(tool)
    else byType.set(key, [tool])
  }

  return [...byType.entries()]
    .map(([typeName, groupTools]) => ({ typeName, tools: groupTools }))
    .sort((a, b) => {
      if (a.typeName === NO_TOOL_TYPE) return 1
      if (b.typeName === NO_TOOL_TYPE) return -1
      return a.typeName.localeCompare(b.typeName)
    })
}

const ROUTE = "/tools/warehouse"

/** Builds a `/tools/warehouse?...` href for the current filters with one or
 *  both overridden — no `page` to reset, unlike `toolsListHref`: this
 *  dashboard doesn't paginate. */
export function warehouseHref(overrides: Partial<WarehouseListParams>, current: WarehouseListParams): string {
  const merged = { ...current, ...overrides }
  const search = new URLSearchParams()
  if (merged.condition !== ALL_FILTER_VALUE) search.set("condition", merged.condition)

  const query = search.toString()
  return query ? `${ROUTE}?${query}` : ROUTE
}
