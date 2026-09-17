import { NO_LOCATION, type DashboardTool } from "@/lib/bubble/pickup-tools-types"

/**
 * Pure filtering/pagination/URL helpers for the Tools page's "All tools" tab —
 * a flat, paginated grid over every tool, as opposed to the "By location" tab's
 * cards-per-location grouping (`components/tools-dashboard.tsx`). Kept pure
 * and client-safe, same idiom as `lib/trips/plan-types.ts`, so both the server
 * component doing the filtering and the client components building hrefs can
 * import it.
 */

/** Sentinel for a filter `Select`'s "no filter" option — no live Bubble
 *  option-set value is ever this string. */
export const ALL_FILTER_VALUE = "all"

/** Cards per page — a multiple of every grid width this tab renders at (2, 3 and 4 columns). */
export const TOOLS_LIST_PAGE_SIZE = 12

export type ToolsListRawParams = {
  q?: string
  type?: string
  status?: string
  condition?: string
  location?: string
  page?: string
}

export type ToolsListParams = {
  q: string
  type: string
  status: string
  condition: string
  location: string
  page: number
}

export function parseToolsListParams(raw: ToolsListRawParams): ToolsListParams {
  return {
    q: raw.q ?? "",
    type: raw.type ?? ALL_FILTER_VALUE,
    status: raw.status ?? ALL_FILTER_VALUE,
    condition: raw.condition ?? ALL_FILTER_VALUE,
    location: raw.location ?? ALL_FILTER_VALUE,
    page: Math.max(1, Number(raw.page) || 1),
  }
}

function matches(value: string, filter: string): boolean {
  return filter === ALL_FILTER_VALUE || value === filter
}

/** In-memory filter over every tool — same "fetch everything, filter after"
 *  idiom the rest of this app's `listAllTools` callers already use, just with
 *  more axes than the dashboard's location-only one. */
export function filterTools(tools: DashboardTool[], filters: ToolsListParams): DashboardTool[] {
  const q = filters.q.trim().toLowerCase()
  return tools.filter((tool) => {
    if (q && !tool.name.toLowerCase().includes(q)) return false
    if (!matches(tool.typeName ?? "", filters.type)) return false
    if (!matches(tool.status, filters.status)) return false
    if (!matches(tool.condition, filters.condition)) return false
    if (!matches(tool.location, filters.location)) return false
    return true
  })
}

/** Distinct `typeName`s actually present, so picking a filter can never land
 *  on a value with zero matching rows. */
export function distinctTypeNames(tools: DashboardTool[]): string[] {
  return [...new Set(tools.map((tool) => tool.typeName).filter((name): name is string => Boolean(name)))].sort()
}

/** Distinct locations, `NO_LOCATION` sorted last — same convention
 *  `tools-dashboard.tsx` uses for its own location list. */
export function distinctLocations(tools: DashboardTool[]): string[] {
  const names = new Set(tools.map((tool) => tool.location))
  const real = [...names].filter((name) => name !== NO_LOCATION).sort()
  return names.has(NO_LOCATION) ? [...real, NO_LOCATION] : real
}

/** The standalone "All tools" route — separate from `/tools`, which is the
 *  by-location dashboard. */
const LIST_ROUTE = "/tools/all"

/**
 * Builds an `/tools/all?...` href for the current filter/page state with one
 * or more fields overridden. Omitting `page` from `overrides` resets to page 1
 * — every filter change wants that; only the pagination links pass `page` explicitly.
 */
export function toolsListHref(overrides: Partial<ToolsListParams>, current: ToolsListParams): string {
  const merged = { ...current, ...overrides }
  const search = new URLSearchParams()
  if (merged.q.trim()) search.set("q", merged.q.trim())
  if (merged.type !== ALL_FILTER_VALUE) search.set("type", merged.type)
  if (merged.status !== ALL_FILTER_VALUE) search.set("status", merged.status)
  if (merged.condition !== ALL_FILTER_VALUE) search.set("condition", merged.condition)
  if (merged.location !== ALL_FILTER_VALUE) search.set("location", merged.location)

  const page = overrides.page ?? 1
  if (page > 1) search.set("page", String(page))

  const query = search.toString()
  return query ? `${LIST_ROUTE}?${query}` : LIST_ROUTE
}
