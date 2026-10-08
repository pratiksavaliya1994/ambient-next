import { NO_LOCATION, type DashboardTool } from "@/lib/bubble/pickup-tools-types"
import type { MaterialKind } from "@/lib/bubble/requested-materials-types"
import {
  isPickupMaterial,
  materialQtyLabel,
  pickupQtyLabel,
  stillLoadedMaterials,
} from "@/lib/bubble/trip-materials-types"
import { stillLoaded, type TripDetail } from "@/lib/bubble/trips-types"

/**
 * What the In Transit dashboard shows — every tool and material line on a
 * truck right now, flattened to one row each so the board can filter and group
 * them in the browser. Pure and client-safe; `lib/bubble/in-transit.ts` does
 * the reads.
 *
 * **The trip rows are the source of truth, not `tools.statusNew`.** Materials
 * have no per-unit status at all, and a refusal lives only in `triptool.state` /
 * `tripmaterial.state`. "On the truck" is `isOnTruck` (`Loaded` or `Refused`)
 * on a trip that is `In Transit` — a `Planned` row hasn't been collected yet,
 * so it is still sitting where it was and isn't shown.
 *
 * The one thing `statusNew` adds is the **orphans**: a tool reading `In
 * Transit` with no on-truck row behind it (dispatched under the pre-trip flow,
 * or drift). Hiding it would leave a tool that is somewhere on no screen at
 * all, so it is listed under the driver its `location` names — the pre-trip
 * dispatch wrote the driver's name there — and flagged `no-trip`.
 */

export const NO_DRIVER = "No driver"
/** The destination of a refused row — it rides back to the yard, whatever its row still points at. */
export const BACK_TO_YARD = "Back to yard"
/** The destination of an orphan — with no trip row there is nothing saying where it's headed. */
export const UNKNOWN_DESTINATION = "Unknown"

export type InTransitFlag = "refused" | "no-trip"

type Base = {
  /** Unique across both kinds — React key and nothing else. */
  key: string
  driver: string
  tripId: string | null
  name: string
  /** Where it was collected. Empty for an orphan. */
  from: string
  destination: string
  /** For a refused row: the site that turned it away. */
  refusedBy: string | null
  flag: InTransitFlag | null
}

export type InTransitTool = Base & { kind: "tool"; toolId: string; typeName: string; condition: string }
export type InTransitMaterial = Base & { kind: "material"; qtyLabel: string; materialKind: MaterialKind | null }
export type InTransitItem = InTransitTool | InTransitMaterial

export type InTransitLoad = {
  items: InTransitItem[]
  /** `trip._id` → when it left, for the card's trip links. */
  trips: Record<string, { startedAt: string | null }>
}

const driverOf = (name: string | null) => name?.trim() || NO_DRIVER

/** Shared by both kinds of trip row: where it's going, and whether a site already said no. */
function journey(row: { state: string; toLocation: string; fromLocation: string }) {
  const refused = row.state === "Refused"
  return {
    from: row.fromLocation,
    destination: refused ? BACK_TO_YARD : row.toLocation || UNKNOWN_DESTINATION,
    refusedBy: refused ? row.toLocation || null : null,
    flag: refused ? ("refused" as const) : null,
  }
}

export function buildInTransit(trips: readonly TripDetail[], inTransitTools: readonly DashboardTool[]): InTransitLoad {
  const toolsById = new Map(inTransitTools.map((tool) => [tool.id, tool]))
  const onTruck = new Set<string>()
  const items: InTransitItem[] = []

  for (const trip of trips) {
    const driver = driverOf(trip.driver)
    for (const row of stillLoaded(trip.items)) {
      onTruck.add(row.toolId)
      const tool = toolsById.get(row.toolId)
      items.push({
        kind: "tool",
        key: `t:${row.id}`,
        driver,
        tripId: trip.id,
        name: row.toolName || tool?.name || "Unnamed tool",
        ...journey(row),
        toolId: row.toolId,
        typeName: row.toolType || tool?.typeName || "",
        condition: tool?.condition ?? "",
      })
    }
    for (const row of stillLoadedMaterials(trip.materials)) {
      items.push({
        kind: "material",
        key: `m:${row.id}`,
        driver,
        tripId: trip.id,
        name: row.name || "Unnamed material",
        ...journey(row),
        qtyLabel: isPickupMaterial(row) ? pickupQtyLabel(row) : materialQtyLabel(row),
        materialKind: row.kind,
      })
    }
  }

  for (const tool of inTransitTools) {
    if (onTruck.has(tool.id)) continue
    items.push({
      kind: "tool",
      key: `o:${tool.id}`,
      driver: tool.location === NO_LOCATION ? NO_DRIVER : driverOf(tool.location),
      tripId: null,
      name: tool.name,
      from: "",
      destination: UNKNOWN_DESTINATION,
      refusedBy: null,
      flag: "no-trip",
      toolId: tool.id,
      typeName: tool.typeName ?? "",
      condition: tool.condition,
    })
  }

  return {
    items,
    trips: Object.fromEntries(trips.map((trip) => [trip.id, { startedAt: trip.startedAt }])),
  }
}
