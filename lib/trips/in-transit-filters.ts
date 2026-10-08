import { matchesAny, NOT_SET } from "@/lib/tools/dashboard-filters"
import {
  BACK_TO_YARD,
  NO_DRIVER,
  UNKNOWN_DESTINATION,
  type InTransitItem,
  type InTransitMaterial,
  type InTransitTool,
} from "@/lib/trips/in-transit"

/**
 * The In Transit dashboard's client-side filters and grouping — the Job
 * Dashboard's rules (`dashboard-filters.ts`): an empty axis means "all", axes
 * AND together, values within one axis OR.
 *
 * `toolTypes` and `conditions` describe tools only, so a pick on either drops
 * every material line. That isn't a special case — a material has no tool type
 * to match, so the AND rule already says so.
 */

export const CARGO_KINDS = ["Tools", "Materials"] as const
export type CargoKindOption = (typeof CARGO_KINDS)[number]

export const LOAD_STATES = ["On truck", "Refused", "No trip"] as const
export type LoadState = (typeof LOAD_STATES)[number]

export type InTransitFilters = {
  drivers: string[]
  kinds: CargoKindOption[]
  destinations: string[]
  origins: string[]
  toolTypes: string[]
  conditions: string[]
  states: LoadState[]
  /** Committed name search, over tools and materials alike. */
  query: string
}

export const EMPTY_IN_TRANSIT_FILTERS: InTransitFilters = {
  drivers: [],
  kinds: [],
  destinations: [],
  origins: [],
  toolTypes: [],
  conditions: [],
  states: [],
  query: "",
}

export function hasInTransitFilters(filters: InTransitFilters): boolean {
  return Object.values(filters).some((value) => value.length > 0)
}

export const kindOf = (item: InTransitItem): CargoKindOption => (item.kind === "tool" ? "Tools" : "Materials")
export const originOf = (item: InTransitItem) => item.from || NOT_SET
export const stateOf = (item: InTransitItem): LoadState =>
  item.flag === "refused" ? "Refused" : item.flag === "no-trip" ? "No trip" : "On truck"
/** `null` for a material — it has no tool type or condition, so it matches neither axis once one is picked. */
export const toolTypeOf = (item: InTransitItem) => (item.kind === "tool" ? item.typeName || NOT_SET : null)
export const conditionOf = (item: InTransitItem) => (item.kind === "tool" ? item.condition || NOT_SET : null)

/** Distinct values across `items`, sorted, with the catch-all `last` values at the end. */
export function optionsOf(
  items: readonly InTransitItem[],
  pick: (item: InTransitItem) => string | null,
  last: readonly string[] = [NOT_SET]
): string[] {
  const values = new Set(items.map(pick).filter((value): value is string => value !== null))
  const real = [...values].filter((value) => !last.includes(value)).sort()
  return [...real, ...last.filter((value) => values.has(value))]
}

const matchesTools = (selected: string[], value: string | null) =>
  selected.length === 0 || (value !== null && selected.includes(value))

export function filterInTransit(items: readonly InTransitItem[], filters: InTransitFilters): InTransitItem[] {
  const query = filters.query.toLowerCase()
  return items.filter(
    (item) =>
      (!query || item.name.toLowerCase().includes(query)) &&
      matchesAny(filters.drivers, item.driver) &&
      matchesAny(filters.kinds, kindOf(item)) &&
      matchesAny(filters.destinations, item.destination) &&
      matchesAny(filters.origins, originOf(item)) &&
      matchesAny(filters.states, stateOf(item)) &&
      matchesTools(filters.toolTypes, toolTypeOf(item)) &&
      matchesTools(filters.conditions, conditionOf(item))
  )
}

/** The destinations that aren't a place, sorted after every real one. */
export const TRAILING_DESTINATIONS = [BACK_TO_YARD, UNKNOWN_DESTINATION] as const

export type DestinationGroup = { destination: string; tools: InTransitTool[]; materials: InTransitMaterial[] }
export type DriverGroup = {
  driver: string
  tripIds: string[]
  toolCount: number
  materialCount: number
  destinations: DestinationGroup[]
}

const byName = (a: InTransitItem, b: InTransitItem) => a.name.localeCompare(b.name)

/** Real values alphabetical, then the `trailing` ones in the order given. */
function trailingLast(trailing: readonly string[]) {
  const rank = (value: string) => trailing.indexOf(value) // -1 for every real value, so they sort first
  return (a: string, b: string) => rank(a) - rank(b) || a.localeCompare(b)
}

/** One card per driver (A→Z, `NO_DRIVER` last), each split by where the load is headed. */
export function groupByDriver(items: readonly InTransitItem[]): DriverGroup[] {
  const byDriver = new Map<string, InTransitItem[]>()
  for (const item of items) byDriver.set(item.driver, [...(byDriver.get(item.driver) ?? []), item])

  const destinationOrder = trailingLast(TRAILING_DESTINATIONS)
  return [...byDriver.keys()].sort(trailingLast([NO_DRIVER])).map((driver) => {
    const load = byDriver.get(driver)!
    const byDestination = new Map<string, InTransitItem[]>()
    for (const item of load) {
      byDestination.set(item.destination, [...(byDestination.get(item.destination) ?? []), item])
    }
    const tools = load.filter((item): item is InTransitTool => item.kind === "tool")
    return {
      driver,
      tripIds: [...new Set(load.flatMap((item) => (item.tripId ? [item.tripId] : [])))],
      toolCount: tools.length,
      materialCount: load.length - tools.length,
      destinations: [...byDestination.keys()].sort(destinationOrder).map((destination) => {
        const here = byDestination.get(destination)!
        return {
          destination,
          tools: here.filter((item): item is InTransitTool => item.kind === "tool").sort(byName),
          materials: here.filter((item): item is InTransitMaterial => item.kind === "material").sort(byName),
        }
      }),
    }
  })
}
