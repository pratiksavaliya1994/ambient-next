import { isWarehouseDestination } from "@/lib/bubble/enums"
import type { DashboardTool } from "@/lib/bubble/pickup-tools-types"
import { conditionOf, matchesAny, NOT_SET, statusOf } from "@/lib/tools/dashboard-filters"

/**
 * Pure filtering/grouping helpers for the Warehouse dashboard — every tool
 * currently at the warehouse, grouped by tool type rather than by location
 * (every row here already shares the same location, so grouping by it would
 * show nothing).
 *
 * "At the warehouse" is the strict destination check (`isWarehouseDestination`
 * — `tools.location === "Warehouse"`), not the lenient `isWarehouseLocation`
 * dispatch/collect code uses. That one also treats a blank `location` as
 * "close enough to skip a collect stop," which is the right call for planning
 * a trip but wrong here: a tool with no location set hasn't been confirmed to
 * physically be on site, and this dashboard would be lying if it said so.
 *
 * No floor filter: `tools.floor` on a warehouse row is residue from the job
 * site it came back from — nothing clears it on return — so it says nothing
 * about where the tool is now.
 *
 * Filters follow the Job Dashboard's rules (`dashboard-filters.ts`): an empty
 * axis means "all", axes AND together, values within one axis OR.
 */

/** Grouping bucket for a tool whose `type` link didn't resolve to a name —
 *  display-only, same convention as `NO_LOCATION`. */
export const NO_TOOL_TYPE = "No tool type"

export type WarehouseFilters = {
  types: string[]
  statuses: string[]
  conditions: string[]
  shelves: string[]
  /** Committed tool-name search. */
  query: string
}

export const EMPTY_WAREHOUSE_FILTERS: WarehouseFilters = {
  types: [],
  statuses: [],
  conditions: [],
  shelves: [],
  query: "",
}

export function hasWarehouseFilters(filters: WarehouseFilters): boolean {
  return (
    filters.types.length > 0 ||
    filters.statuses.length > 0 ||
    filters.conditions.length > 0 ||
    filters.shelves.length > 0 ||
    filters.query !== ""
  )
}

/** Matches the card titles, so a picked type reads the same as its card. */
export const warehouseTypeOf = (tool: DashboardTool) => tool.typeName ?? NO_TOOL_TYPE
export const shelfOf = (tool: DashboardTool) => tool.warehouseLocation?.trim() || NOT_SET

/** The tools this dashboard is about — the strict "at the warehouse" check above. */
export function warehouseTools(tools: DashboardTool[]): DashboardTool[] {
  return tools.filter((tool) => isWarehouseDestination(tool.location))
}

export function filterWarehouseTools(tools: DashboardTool[], filters: WarehouseFilters): DashboardTool[] {
  const query = filters.query.toLowerCase()
  return tools.filter(
    (tool) =>
      (!query || tool.name.toLowerCase().includes(query)) &&
      matchesAny(filters.types, warehouseTypeOf(tool)) &&
      matchesAny(filters.statuses, statusOf(tool)) &&
      matchesAny(filters.conditions, conditionOf(tool)) &&
      matchesAny(filters.shelves, shelfOf(tool))
  )
}

export type WarehouseTypeGroup = { typeName: string; tools: DashboardTool[] }

/** Groups by `typeName`, sorted alphabetically with `NO_TOOL_TYPE` last —
 *  the one card that can't be identified by name earns the least prominent spot. */
export function groupByToolType(tools: DashboardTool[]): WarehouseTypeGroup[] {
  const byType = new Map<string, DashboardTool[]>()
  for (const tool of tools) {
    const key = warehouseTypeOf(tool)
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
