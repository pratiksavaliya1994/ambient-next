import "server-only"

import { isPickupRequest } from "@/lib/bubble/enums"
import { listRequestStopInfo } from "@/lib/bubble/requests"
import type { MaterialCount, MaterialStopLists } from "@/lib/bubble/trip-material-payload"
import {
  outstandingCollectMaterials,
  outstandingDropMaterials,
  refusableMaterials,
  type TripMaterialRow,
} from "@/lib/bubble/trip-materials-types"
import type { StopWork } from "@/lib/bubble/trips-types"
import { MATERIALS_STILL_LANDING, waitForMaterialRows } from "@/lib/trips/settle"

/**
 * The material half of `completeStopAction`, split out so that file stays
 * readable. The rules copy the tool half exactly. What was ticked must still
 * be outstanding **at this stop, on the right side of it**, and every list is
 * decided by the row's **live state and its request's direction**, both read
 * here — never by what the browser named.
 *
 * Direction matters since 5F, because a pickup line moves stock the other way:
 *
 * - **collect** — a delivery line is loaded as planned; a pickup line is
 *   **counted** (`countMaterials`), and a count of 0 is a skip;
 * - **drop at a job** — the same for both: a pickup row dropped at a job is a
 *   transfer, and `drop-material-at-site` credits the driver's count;
 * - **drop at the yard** — a pickup row is **landed** into stock
 *   (`landMaterialIds`), `Loaded` or a refused transfer alike. A refused
 *   delivery row is returned (`returnMaterialIds`). Never the other way round:
 *   `return-material-stock` would lower a pickup line's `assignedQty` and
 *   un-approve it.
 */

export type StopMaterialChoice = {
  dropMaterialIds: readonly string[]
  loadMaterialIds: readonly string[]
  skipMaterialIds: readonly string[]
  refuseMaterialIds: readonly string[]
  /** What the driver counted for each pickup line in `loadMaterialIds`. */
  counts: readonly MaterialCount[]
}

const ids = (rows: readonly { lineId: string }[]) => new Set(rows.map((row) => row.lineId))

/** Every line id the stop named, for the request-status sync. */
export function touchedMaterialLines(choice: StopMaterialChoice): Set<string> {
  const { dropMaterialIds, loadMaterialIds, skipMaterialIds, refuseMaterialIds } = choice
  return new Set([...dropMaterialIds, ...loadMaterialIds, ...skipMaterialIds, ...refuseMaterialIds])
}

/** The seven lists to send, or the sentence refusing the stop. */
export async function stopMaterialLists(
  work: StopWork,
  choice: StopMaterialChoice
): Promise<MaterialStopLists | { error: string }> {
  const { dropMaterialIds, loadMaterialIds, skipMaterialIds, refuseMaterialIds, counts } = choice

  const droppable = ids(outstandingDropMaterials(work))
  if (dropMaterialIds.some((id) => !droppable.has(id))) {
    return { error: "One of those materials isn't on the truck waiting to be dropped here. Reload the page." }
  }
  const collectable = ids(outstandingCollectMaterials(work))
  if ([...loadMaterialIds, ...skipMaterialIds].some((id) => !collectable.has(id))) {
    return { error: "One of those materials isn't still to be collected here. Reload the page." }
  }
  const refusables = ids(refusableMaterials(work))
  if (refuseMaterialIds.some((id) => !refusables.has(id))) {
    return {
      error:
        work.stop.kind === "Warehouse"
          ? "Materials can't be turned away at the yard — that's where they come back to."
          : "One of those materials isn't a delivery waiting at this stop. Reload the page.",
    }
  }

  const named = touchedMaterialLines(choice)
  const rows = [...work.collectMaterials, ...work.dropMaterials].filter((row) => named.has(row.lineId))
  const isPickupRow = await pickupRowTest(rows)
  if (!isPickupRow) return { error: "One of these materials' requests no longer exists. Reload the page." }
  const rowOf = new Map(rows.map((row) => [row.lineId, row]))
  const pickupLine = (id: string) => {
    const row = rowOf.get(id)
    return row !== undefined && isPickupRow(row)
  }

  // Collect: a pickup line is counted, a delivery line is loaded as planned.
  const countOf = new Map(counts.map((count) => [count.lineId, count.actualQty]))
  const loadedPickups = loadMaterialIds.filter(pickupLine)
  if (counts.some((count) => !loadedPickups.includes(count.lineId))) {
    return { error: "A count was sent for a material that isn't a pickup being collected here. Reload the page." }
  }
  const uncounted = loadedPickups.find((id) => !countOf.has(id))
  if (uncounted) return { error: `Enter how many ${rowOf.get(uncounted)?.name ?? "of that material"} you collected.` }
  const countMaterials = loadedPickups.flatMap((id) => {
    const actualQty = countOf.get(id) ?? 0
    return actualQty > 0 ? [{ lineId: id, actualQty }] : []
  })
  const countedZero = loadedPickups.filter((id) => (countOf.get(id) ?? 0) === 0)

  // Drop: split by live state and direction.
  const refusedHere = ids(work.dropMaterials.filter((row) => row.state === "Refused"))
  const atYard = work.stop.kind === "Warehouse"
  const landMaterialIds = atYard ? dropMaterialIds.filter(pickupLine) : []
  const deliveryDrops = dropMaterialIds.filter((id) => !pickupLine(id))
  const returnMaterialIds = deliveryDrops.filter((id) => refusedHere.has(id))
  const plainDrops = dropMaterialIds.filter((id) => !refusedHere.has(id) && !landMaterialIds.includes(id))

  // A delivery line at the yard would credit a site row named after the
  // warehouse, and site stock never holds the warehouse. A refused transfer
  // off-yard would be sent to `return-material-stock`, which un-approves it.
  if (atYard && plainDrops.length > 0) {
    return { error: "Only material pickups and refused lines can be unloaded at the yard. Leave the others unticked." }
  }
  if (!atYard && dropMaterialIds.some((id) => pickupLine(id) && refusedHere.has(id))) {
    return { error: "A refused transfer can only be unloaded at the yard. Leave it on the truck." }
  }

  return {
    dropMaterialIds: plainDrops,
    loadMaterialIds: loadMaterialIds.filter((id) => !pickupLine(id)),
    skipMaterialIds: [...skipMaterialIds, ...countedZero],
    refuseMaterialIds,
    returnMaterialIds,
    countMaterials,
    landMaterialIds,
  }
}

/**
 * Which rows belong to pickup requests, read fresh. `null` when a row's
 * request can't be read: guessing a direction would either record a pickup's
 * estimate as its count or put a delivery into stock, so the stop is refused.
 */
async function pickupRowTest(rows: readonly TripMaterialRow[]): Promise<((row: TripMaterialRow) => boolean) | null> {
  const requestIds = [...new Set(rows.map((row) => row.requestId))]
  if (requestIds.length === 0) return () => false
  const requests = await listRequestStopInfo(requestIds.filter(Boolean))
  if (requestIds.some((id) => !requests.some((request) => request.id === id))) return null
  const pickups = new Set(requests.filter((request) => isPickupRequest(request)).map((request) => request.id))
  return (row) => pickups.has(row.requestId)
}

/**
 * Waits for the asynchronous flips `complete-trip-stop` hands off — job drops
 * to `Dropped`, yard returns to `Returned`, counts to `Loaded`, yard unloads to
 * `Dropped` or (a refused transfer) `Returned` — so the page the driver sees
 * next, and the request statuses derived after this, read them landed. A
 * warning if any is still running.
 */
export async function settleStopMaterials(tripId: string, lists: MaterialStopLists): Promise<string | undefined> {
  const settled = await Promise.all([
    waitForMaterialRows(tripId, lists.dropMaterialIds, "Dropped"),
    waitForMaterialRows(tripId, lists.returnMaterialIds, "Returned"),
    waitForMaterialRows(
      tripId,
      lists.countMaterials.map((count) => count.lineId),
      "Loaded"
    ),
    waitForMaterialRows(tripId, lists.landMaterialIds, ["Dropped", "Returned"]),
  ])
  return settled.every(Boolean) ? undefined : MATERIALS_STILL_LANDING
}
