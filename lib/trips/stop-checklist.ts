import {
  isPickupMaterial,
  outstandingCollectMaterials,
  outstandingDropMaterials,
  pickupQtyLabel,
  refusableMaterials,
  type TripMaterialRow,
} from "@/lib/bubble/trip-materials-types"
import { outstandingCollect, outstandingDrop, refusable, type StopWork, type TripToolRow } from "@/lib/bubble/trips-types"
import { materialStopRow, type StopBucket, type StopRow } from "@/lib/trips/stop-material-rows"

export type { StopRow } from "@/lib/trips/stop-material-rows"

/**
 * What recording one stop will send, from the stop's work, the rows the driver
 * has unticked and the pickup lines they've counted — tools and material lines
 * through the same rules.
 *
 * Pure and hook-free, out of `TripStopActions` so that component stays a
 * layout. The rules are the tool ones, applied to both row kinds:
 *
 * - a collect is taken unless unticked, and an unticked one is left behind;
 * - a drop is delivered unless unticked, and only a drop `refusable` names can
 *   be unticked — anywhere else (a warehouse, a row already refused upstream)
 *   it stays delivered, because no checkbox was ever offered for it.
 *
 * **Pickup lines are counted, not ticked (5G §3).** Each count starts at the
 * PM's estimate and the driver corrects it; `0` is "not collected". A field
 * the driver cleared is a question not yet answered — `uncounted` keeps the
 * stop's button disabled until it has a number again. Their drops (at the
 * yard, or a transfer's site) are ticks like any other.
 *
 * **One `unticked` set covers both kinds**: a tool is addressed by its tool id
 * and a line by its line id, and Bubble ids never collide. Each is on at most
 * one side of a stop, since a trip has one row per tool and one per line.
 */

/** A pickup line waiting for its count at this stop. */
export type CountRow = {
  id: string
  name: string
  estimate: string
  unit: string
  to: string
  /** What the field holds: the driver's number, the estimate if untouched, `null` if cleared. */
  count: number | null
}

export type StopChecklist = {
  /** Nothing outstanding here now, so there is nothing to record yet. */
  idle: boolean
  /** Rows with a "collected" checkbox. */
  collectable: StopRow[]
  /** Pickup lines with a "collected" count instead. */
  countable: CountRow[]
  /** How many of `countable` have no count yet — the button waits for them. */
  uncounted: number
  /** Rows with a "delivered" checkbox — only where the site may refuse. */
  refusable: StopRow[]
  /** What pressing the button records, split as the confirm dialog shows it. */
  summary: Record<"collect" | "skip" | "drop" | "refuse", StopRow[]>
  /** For the button label: what gets collected and dropped, per kind. */
  counts: { collect: number; drop: number; collectMaterials: number; dropMaterials: number }
  /** The `completeStopAction` lists, minus `tripId` and `stopKey`. */
  input: Record<`${"drop" | "load" | "skip" | "refuse"}${"Tool" | "Material"}Ids`, string[]> & {
    counts: { lineId: string; actualQty: number }[]
  }
}

const toolRow = (item: TripToolRow): StopRow => ({
  id: item.toolId,
  label: item.toolName,
  detail: item.toolType && item.toolType !== item.toolName ? item.toolType : undefined,
  kind: "tool",
})

type Split<T> = Record<StopBucket, T[]>

function split<T>(
  toCollect: T[],
  toDrop: T[],
  canRefuse: T[],
  idOf: (row: T) => string,
  unticked: ReadonlySet<string>
): Split<T> {
  const refused = canRefuse.filter((row) => unticked.has(idOf(row)))
  const refusedIds = new Set(refused.map(idOf))
  return {
    toCollect,
    canRefuse,
    loaded: toCollect.filter((row) => !unticked.has(idOf(row))),
    skipped: toCollect.filter((row) => unticked.has(idOf(row))),
    dropped: toDrop.filter((row) => !refusedIds.has(idOf(row))),
    refused,
  }
}

export function stopChecklist(
  work: StopWork,
  unticked: ReadonlySet<string>,
  changed: ReadonlyMap<string, number | null> = new Map()
): StopChecklist {
  const toDrop = outstandingDrop(work)
  const toDropMaterials = outstandingDropMaterials(work)
  const collectMaterials = outstandingCollectMaterials(work)
  const toCount = collectMaterials.filter(isPickupMaterial)
  const toTick = collectMaterials.filter((row) => !isPickupMaterial(row))
  // Untouched, a count is the estimate; the driver's own number once changed.
  const counted = new Map(
    toCount.flatMap((row) => {
      const count = changed.has(row.lineId) ? changed.get(row.lineId) : row.qty
      return count === null || count === undefined ? [] : [[row.lineId, count] as const]
    })
  )

  const tools = split(outstandingCollect(work), toDrop, refusable(work), (item) => item.toolId, unticked)
  const lines = split(toTick, toDropMaterials, refusableMaterials(work), (row) => row.lineId, unticked)
  // A counted line is loaded above 0 and left behind at 0; uncounted, it's neither yet.
  const countedLoaded = toCount.filter((row) => (counted.get(row.lineId) ?? 0) > 0)
  const countedZero = toCount.filter((row) => counted.get(row.lineId) === 0)

  const toolIds = (rows: TripToolRow[]) => rows.map((item) => item.toolId)
  const lineIds = (rows: TripMaterialRow[]) => rows.map((row) => row.lineId)
  const lineRow = (bucket: StopBucket) => (row: TripMaterialRow) =>
    materialStopRow(row, bucket, work.stop, counted.get(row.lineId))
  const rows = (bucket: StopBucket, extra: TripMaterialRow[] = []) => [
    ...tools[bucket].map(toolRow),
    ...[...lines[bucket], ...extra].map(lineRow(bucket)),
  ]

  return {
    idle: tools.toCollect.length + toDrop.length + collectMaterials.length + toDropMaterials.length === 0,
    collectable: rows("toCollect"),
    countable: toCount.map((row) => ({
      id: row.lineId,
      name: row.name,
      estimate: pickupQtyLabel(row),
      unit: row.unit.trim(),
      to: row.toLocation,
      count: counted.get(row.lineId) ?? null,
    })),
    uncounted: toCount.filter((row) => !counted.has(row.lineId)).length,
    refusable: rows("canRefuse"),
    summary: {
      collect: rows("loaded", countedLoaded),
      skip: rows("skipped", countedZero),
      drop: rows("dropped"),
      refuse: rows("refused"),
    },
    counts: {
      collect: tools.loaded.length,
      drop: tools.dropped.length,
      collectMaterials: lines.loaded.length + countedLoaded.length,
      dropMaterials: lines.dropped.length,
    },
    input: {
      dropToolIds: toolIds(tools.dropped),
      loadToolIds: toolIds(tools.loaded),
      skipToolIds: toolIds(tools.skipped),
      refuseToolIds: toolIds(tools.refused),
      dropMaterialIds: lineIds(lines.dropped),
      loadMaterialIds: lineIds([...lines.loaded, ...countedLoaded]),
      skipMaterialIds: lineIds([...lines.skipped, ...countedZero]),
      refuseMaterialIds: lineIds(lines.refused),
      counts: countedLoaded.map((row) => ({ lineId: row.lineId, actualQty: counted.get(row.lineId) ?? 0 })),
    },
  }
}
