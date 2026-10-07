import { isWarehouseLocation } from "@/lib/bubble/enums"
import { NO_LOCATION, type DashboardTool } from "@/lib/bubble/pickup-tools-types"

/**
 * The Job Dashboard's client-side filters — pure, so the toolbar and the grid
 * share one definition of "matches".
 *
 * Every list axis treats **empty as "no filter"**, not "nothing selected":
 * the dashboard opens on every site and each pick narrows from there. Axes
 * AND together; values within one axis OR.
 */

/** Stand-in for a blank `statusNew`/`condition`/type, so "not set" is pickable. */
export const NOT_SET = "Not set"

export const LOCATION_KINDS = ["Job site", "Warehouse", NO_LOCATION] as const
export type LocationKind = (typeof LOCATION_KINDS)[number]

export type DashboardFilters = {
  sites: string[]
  kinds: LocationKind[]
  types: string[]
  statuses: string[]
  conditions: string[]
  /** Committed tool-name search — see `filterDashboard` for how it widens `sites`. */
  query: string
}

export const EMPTY_DASHBOARD_FILTERS: DashboardFilters = {
  sites: [],
  kinds: [],
  types: [],
  statuses: [],
  conditions: [],
  query: "",
}

export function hasDashboardFilters(filters: DashboardFilters): boolean {
  return (
    filters.sites.length > 0 ||
    filters.kinds.length > 0 ||
    filters.types.length > 0 ||
    filters.statuses.length > 0 ||
    filters.conditions.length > 0 ||
    filters.query !== ""
  )
}

export function locationKindOf(location: string): LocationKind {
  if (location === NO_LOCATION) return NO_LOCATION
  return isWarehouseLocation(location) ? "Warehouse" : "Job site"
}

export const typeOf = (tool: DashboardTool) => tool.typeName || NOT_SET
export const statusOf = (tool: DashboardTool) => tool.status || NOT_SET
export const conditionOf = (tool: DashboardTool) => tool.condition || NOT_SET

/** Distinct values of one field across `tools`, sorted, `NOT_SET` last. */
export function optionsOf(tools: DashboardTool[], pick: (tool: DashboardTool) => string): string[] {
  const values = new Set(tools.map(pick))
  const real = [...values].filter((value) => value !== NOT_SET).sort()
  return values.has(NOT_SET) ? [...real, NOT_SET] : real
}

export const matchesAny = (selected: string[], value: string) => selected.length === 0 || selected.includes(value)

export type DashboardGroup = { location: string; tools: DashboardTool[]; isExtra: boolean }

/**
 * Tools grouped by location, in `locations` order, dropping locations left
 * with no matching tool.
 *
 * A committed name search ignores the **site** pick (only that axis), so a
 * match on an unpicked site still surfaces — its card is flagged `isExtra`.
 * Type, status, condition and location kind still apply to it.
 */
export function filterDashboard(
  tools: DashboardTool[],
  locations: string[],
  filters: DashboardFilters
): DashboardGroup[] {
  const query = filters.query.toLowerCase()
  const byLocation = new Map<string, DashboardTool[]>()
  for (const tool of tools) {
    if (query ? !tool.name.toLowerCase().includes(query) : !matchesAny(filters.sites, tool.location)) continue
    if (!matchesAny(filters.kinds, locationKindOf(tool.location))) continue
    if (!matchesAny(filters.types, typeOf(tool))) continue
    if (!matchesAny(filters.statuses, statusOf(tool))) continue
    if (!matchesAny(filters.conditions, conditionOf(tool))) continue
    const bucket = byLocation.get(tool.location)
    if (bucket) bucket.push(tool)
    else byLocation.set(tool.location, [tool])
  }
  return locations
    .filter((location) => byLocation.has(location))
    .map((location) => ({
      location,
      tools: byLocation.get(location)!,
      isExtra: query.length > 0 && filters.sites.length > 0 && !filters.sites.includes(location),
    }))
}
