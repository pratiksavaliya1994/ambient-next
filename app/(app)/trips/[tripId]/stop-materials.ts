import "server-only"

import type { MaterialStopLists } from "@/lib/bubble/trip-material-payload"
import {
  outstandingCollectMaterials,
  outstandingDropMaterials,
  refusableMaterials,
} from "@/lib/bubble/trip-materials-types"
import type { StopWork } from "@/lib/bubble/trips-types"
import { MATERIALS_STILL_LANDING, waitForMaterialRows } from "@/lib/trips/settle"

/**
 * The material half of `completeStopAction`, split out so that file stays
 * readable. The rules copy the tool half exactly. What was ticked must still
 * be outstanding **at this stop, on the right side of it**. Drops at the yard
 * are split into returns by the row's live state, never by what the browser
 * named.
 */

export type StopMaterialChoice = {
  dropMaterialIds: readonly string[]
  loadMaterialIds: readonly string[]
  skipMaterialIds: readonly string[]
  refuseMaterialIds: readonly string[]
}

const ids = (rows: readonly { lineId: string }[]) => new Set(rows.map((row) => row.lineId))

/** The five lists to send, or the sentence refusing the stop. */
export function stopMaterialLists(work: StopWork, choice: StopMaterialChoice): MaterialStopLists | { error: string } {
  const { dropMaterialIds, loadMaterialIds, skipMaterialIds, refuseMaterialIds } = choice

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

  // At the yard the only material coming off in 5D is one a site refused.
  // Anything else unloading there is a pickup line (5F). `drop-material-at-site`
  // would credit it to a site row named after the warehouse, and site stock
  // never holds the warehouse.
  const refusedHere = ids(work.dropMaterials.filter((row) => row.state === "Refused"))
  const returnMaterialIds = dropMaterialIds.filter((id) => refusedHere.has(id))
  const plainDrops = dropMaterialIds.filter((id) => !refusedHere.has(id))
  if (work.stop.kind === "Warehouse" && plainDrops.length > 0) {
    return { error: "Unloading material pickups at the yard isn't supported yet. Leave those lines unticked." }
  }

  return {
    dropMaterialIds: plainDrops,
    loadMaterialIds,
    skipMaterialIds,
    refuseMaterialIds,
    returnMaterialIds,
  }
}

/**
 * Waits for the two asynchronous flips `complete-trip-stop` hands off — job
 * drops to `Dropped`, yard returns to `Returned` — so the page the driver
 * sees next, and the request statuses derived after this, read them landed.
 * A warning if either is still running.
 */
export async function settleStopMaterials(tripId: string, lists: MaterialStopLists): Promise<string | undefined> {
  const [dropped, returned] = await Promise.all([
    waitForMaterialRows(tripId, lists.dropMaterialIds, "Dropped"),
    waitForMaterialRows(tripId, lists.returnMaterialIds, "Returned"),
  ])
  return dropped && returned ? undefined : MATERIALS_STILL_LANDING
}
