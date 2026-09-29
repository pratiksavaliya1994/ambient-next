import {
  materialQtyLabel,
  outstandingCollectMaterials,
  outstandingDropMaterials,
  refusableMaterials,
  type TripMaterialRow,
} from "@/lib/bubble/trip-materials-types"
import { outstandingCollect, outstandingDrop, refusable, type StopWork, type TripToolRow } from "@/lib/bubble/trips-types"

/**
 * What recording one stop will send, from the stop's work and the rows the
 * driver has unticked — tools and material lines through the same rules.
 *
 * Pure and hook-free, out of `TripStopActions` so that component stays a
 * layout. The rules are the tool ones, applied to both row kinds:
 *
 * - a collect is taken unless unticked, and an unticked one is left behind;
 * - a drop is delivered unless unticked, and only a drop `refusable` names can
 *   be unticked — anywhere else (a warehouse, a row already refused upstream)
 *   it stays delivered, because no checkbox was ever offered for it.
 *
 * **One `unticked` set covers both kinds**: a tool is addressed by its tool id
 * and a line by its line id, and Bubble ids never collide. Each is on at most
 * one side of a stop, since a trip has one row per tool and one per line.
 */

/** One row of a checklist or of the confirm summary — a tool or a material line, alike. */
export type StopRow = { id: string; label: string; detail?: string; kind: "tool" | "material" }

export type StopChecklist = {
  /** Nothing outstanding here now, so there is nothing to record yet. */
  idle: boolean
  /** Rows with a "collected" checkbox. */
  collectable: StopRow[]
  /** Rows with a "delivered" checkbox — only where the site may refuse. */
  refusable: StopRow[]
  /** What pressing the button records, split as the confirm dialog shows it. */
  summary: Record<"collect" | "skip" | "drop" | "refuse", StopRow[]>
  /** For the button label: what gets collected and dropped, per kind. */
  counts: { collect: number; drop: number; collectMaterials: number; dropMaterials: number }
  /** The `completeStopAction` lists, minus `tripId` and `stopKey`. */
  input: Record<`${"drop" | "load" | "skip" | "refuse"}${"Tool" | "Material"}Ids`, string[]>
}

const toolRow = (item: TripToolRow): StopRow => ({
  id: item.toolId,
  label: item.toolName,
  detail: item.toolType && item.toolType !== item.toolName ? item.toolType : undefined,
  kind: "tool",
})

/** `20 bag Level-Flor` — the quantity first, since it's what the driver is counting. */
const materialRow = (row: TripMaterialRow): StopRow => ({
  id: row.lineId,
  label: `${materialQtyLabel(row)} ${row.name}`,
  kind: "material",
})

type Split<T> = { toCollect: T[]; canRefuse: T[]; loaded: T[]; skipped: T[]; dropped: T[]; refused: T[] }

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

export function stopChecklist(work: StopWork, unticked: ReadonlySet<string>): StopChecklist {
  const toDrop = outstandingDrop(work)
  const toDropMaterials = outstandingDropMaterials(work)
  const tools = split(outstandingCollect(work), toDrop, refusable(work), (item) => item.toolId, unticked)
  const lines = split(
    outstandingCollectMaterials(work),
    toDropMaterials,
    refusableMaterials(work),
    (row) => row.lineId,
    unticked
  )

  const toolIds = (rows: TripToolRow[]) => rows.map((item) => item.toolId)
  const lineIds = (rows: TripMaterialRow[]) => rows.map((row) => row.lineId)
  const rows = (key: keyof Split<unknown>) => [...tools[key].map(toolRow), ...lines[key].map(materialRow)]

  return {
    idle: tools.toCollect.length + toDrop.length + lines.toCollect.length + toDropMaterials.length === 0,
    collectable: rows("toCollect"),
    refusable: rows("canRefuse"),
    summary: { collect: rows("loaded"), skip: rows("skipped"), drop: rows("dropped"), refuse: rows("refused") },
    counts: {
      collect: tools.loaded.length,
      drop: tools.dropped.length,
      collectMaterials: lines.loaded.length,
      dropMaterials: lines.dropped.length,
    },
    input: {
      dropToolIds: toolIds(tools.dropped),
      loadToolIds: toolIds(tools.loaded),
      skipToolIds: toolIds(tools.skipped),
      refuseToolIds: toolIds(tools.refused),
      dropMaterialIds: lineIds(lines.dropped),
      loadMaterialIds: lineIds(lines.loaded),
      skipMaterialIds: lineIds(lines.skipped),
      refuseMaterialIds: lineIds(lines.refused),
    },
  }
}
