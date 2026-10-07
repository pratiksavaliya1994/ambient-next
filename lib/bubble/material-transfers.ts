import "server-only"

import { bubbleCreate, bubbleDelete, bubbleGet, bubblePatch } from "@/lib/bubble/client"
import { isPickupRequest, isWarehouseDestination } from "@/lib/bubble/enums"
import type { TransferLink, TransferSource } from "@/lib/bubble/material-transfer-types"
import { readStructuredLines, REQUESTED_MATERIALS } from "@/lib/bubble/requested-materials"
import {
  effectiveQty,
  formatMaterialLine,
  isPickupLineTouched,
  pickupLineStatus,
  type MaterialLine,
} from "@/lib/bubble/requested-materials-types"
import { listOpenRequestsByIds, listRequestStopInfo } from "@/lib/bubble/requests"
import type { LineTripRow } from "@/lib/bubble/trip-materials-types"
import { listTripMaterialsForLines } from "@/lib/bubble/tripmaterial-read"
import { RETRY_DELAYS_MS, sleep } from "@/lib/trips/settle"

/**
 * Reading and writing site-to-site transfer links (5F §2.6).
 *
 * The link lives on the **pickup** line's three `transferTo…` fields, written
 * by a plain Data API `PATCH` — no workflow, because it sets three fields on one
 * row and creates nothing. A pickup line needs no approval, so nothing else
 * goes with it.
 *
 * Bubble must have the three fields before any of this runs (build sheet step
 * 1): a constraint on a field Bubble doesn't know is an error, not an empty
 * result.
 */

export type LinkedPickupLines = { lines: MaterialLine[]; tripRows: LineTripRow[] }

const NONE: LinkedPickupLines = { lines: [], tripRows: [] }

/**
 * Every pickup line linked to any of these delivery lines, with their trip rows
 * — the coverage read `lineProgress`'s `linked` takes. One `in` query, plus the
 * rows' own two.
 */
export async function listLinkedPickupLines(deliveryLineIds: readonly string[]): Promise<LinkedPickupLines> {
  if (deliveryLineIds.length === 0) return NONE
  const wanted = new Set(deliveryLineIds)
  const lines = (
    await readStructuredLines([{ key: "transferToLineID", constraint_type: "in", value: [...wanted] }])
  ).filter((line) => wanted.has(line.transferToLineId))
  if (lines.length === 0) return NONE
  return { lines, tripRows: await listTripMaterialsForLines(lines.map((line) => line.id)) }
}

/**
 * `listLinkedPickupLines`, plus the job each linked line is collected from,
 * by its request id — the request page names the sites feeding a delivery.
 * Closed pickups included: a delivered transfer is still worth naming.
 */
export async function listLinkedPickupSources(
  deliveryLineIds: readonly string[]
): Promise<LinkedPickupLines & { jobs: Map<string, string> }> {
  const linked = await listLinkedPickupLines(deliveryLineIds)
  if (linked.lines.length === 0) return { ...linked, jobs: new Map() }
  const requests = await listRequestStopInfo([...new Set(linked.lines.map((line) => line.requestId))])
  return { ...linked, jobs: new Map(requests.map((request) => [request.id, request.job])) }
}

/**
 * The pickup lines that could feed this delivery's inventory lines, or already
 * do. Each one:
 *
 * - names the same catalogue item;
 * - sits on an open **pickup** request at another job;
 * - is unlinked, or linked to one of these lines (so a linked one still shows);
 * - has no live trip row and isn't done, and no trip has taken part of it yet.
 */
export async function listTransferSources(
  delivery: { job: string },
  deliveryLines: readonly MaterialLine[]
): Promise<TransferSource[]> {
  const ownIds = new Set(deliveryLines.map((line) => line.id))
  const materialIds = [
    ...new Set(deliveryLines.flatMap((line) => (line.kind === "Inventory" && line.materialId ? [line.materialId] : []))),
  ]
  if (materialIds.length === 0) return []

  const candidates = (await readStructuredLines([{ key: "materialID", constraint_type: "in", value: materialIds }])).filter(
    (line) => line.kind === "Inventory" && (line.transferToLineId === "" || ownIds.has(line.transferToLineId))
  )
  if (candidates.length === 0) return []

  const requests = new Map(
    (await listOpenRequestsByIds([...new Set(candidates.map((line) => line.requestId))])).map((request) => [
      request.id,
      request,
    ])
  )
  const pickups = candidates.filter((line) => {
    const request = requests.get(line.requestId)
    return (
      request !== undefined &&
      isPickupRequest(request) &&
      request.job !== delivery.job &&
      !isWarehouseDestination(request.job)
    )
  })
  if (pickups.length === 0) return []

  const tripRows = await listTripMaterialsForLines(pickups.map((line) => line.id))
  return pickups
    .filter((line) => !isPickupLineTouched(line, tripRows))
    .map((line) => {
      const request = requests.get(line.requestId)
      return {
        pickupLineId: line.id,
        pickupRequestId: line.requestId,
        materialId: line.materialId ?? "",
        name: line.name,
        unit: line.unit,
        job: request?.job ?? "",
        start: request?.start ?? null,
        estimate: effectiveQty(line),
        linkedToLineId: line.transferToLineId,
      }
    })
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "") || a.job.localeCompare(b.job))
}

/**
 * Sets — or with `null`, clears — a pickup line's link. A `PATCH` **sets**
 * values, so a retried call writes the same thing again.
 */
export async function setTransferLink(pickupLineId: string, link: TransferLink | null): Promise<void> {
  await bubblePatch(REQUESTED_MATERIALS, pickupLineId, {
    transferToLineID: link?.lineId ?? "",
    transferToRequestID: link?.requestId ?? "",
    transferToLocation: link?.location ?? "",
  })
}

/**
 * Links only **part** of a pickup line (user decision 2026-10-05): when its
 * estimate is more than the delivery still needs, the line is split in two —
 * `keep` linked to the delivery, the rest a new unlinked line on the same
 * pickup, heading for the warehouse. The linked half goes on one trip whole
 * (the remainder, unlinked, can be split); the driver counts the two at the stop.
 *
 * Two writes, in the order that fails safe:
 * 1. `POST` the remainder line — one row, no children, the `/tools/new` rule;
 * 2. `PATCH` the original down to `keep` and set its link, in one call.
 *
 * A failed `PATCH` deletes the remainder again, so the pickup is never left
 * carrying more than its estimate. `jobType` is copied as Bubble returned it.
 */
export async function linkPartOfPickupLine(line: MaterialLine, keep: number, link: TransferLink): Promise<void> {
  const raw = await bubbleGet(REQUESTED_MATERIALS, line.id)
  const rest = effectiveQty(line) - keep
  const restId = await bubbleCreate(REQUESTED_MATERIALS, {
    requestID: line.requestId,
    kind: line.kind,
    materialID: line.materialId ?? "",
    name: line.name,
    unit: line.unit ?? "",
    quantity: rest,
    materials: formatMaterialLine({ ...line, quantity: rest }),
    assignedQty: 0,
    ...(raw?.jobType ? { jobType: raw.jobType } : {}),
  })

  try {
    await bubblePatch(REQUESTED_MATERIALS, line.id, {
      quantity: keep,
      materials: formatMaterialLine({ ...line, quantity: keep }),
      transferToLineID: link.lineId,
      transferToRequestID: link.requestId,
      transferToLocation: link.location,
    })
  } catch (error) {
    await bubbleDelete(REQUESTED_MATERIALS, restId).catch(() => undefined)
    throw error
  }
}

/**
 * Why a pickup line's link can't change now, or `null`. A trip holding the line
 * has already routed it, and a collected line is history — as is one partly
 * collected, since a transfer goes on one trip whole.
 */
export function transferLockReason(line: MaterialLine, tripRows: readonly LineTripRow[]): string | null {
  const status = pickupLineStatus(line, tripRows)
  if (status === "done") return `${line.name} has already been collected.`
  if (status === "idle") {
    return isPickupLineTouched(line, tripRows)
      ? `Part of ${line.name} has already been collected, so it can't become a transfer.`
      : null
  }
  const onTruck = tripRows.some((row) => row.lineId === line.id && (row.state === "Loaded" || row.state === "Refused"))
  return onTruck
    ? `${line.name} is on the truck. Finish the trip first.`
    : `${line.name} is on a draft trip. Remove it from the draft first.`
}

/**
 * Close request's transfer step (5F §2.6), for a request about to close.
 *
 * - **Delivery:** the pickup lines feeding its lines.
 * - **Pickup:** its own linked lines.
 *
 * A line not collected yet is unlinked and heads for the warehouse instead. A collected one keeps its link as history. One a trip holds
 * refuses the close by name. Returns the delivery and pickup request ids whose
 * status the change can move, for the caller to sync.
 */
export async function releaseTransfersForClose(request: {
  delivery: boolean
  pickup: boolean
  materialLines: readonly MaterialLine[]
}): Promise<{ error: string } | { touchedRequestIds: string[] }> {
  const pickup = isPickupRequest(request)
  const { lines, tripRows } = pickup
    ? await ownLinkedLines(request.materialLines)
    : await listLinkedPickupLines(request.materialLines.map((line) => line.id))

  const clear: MaterialLine[] = []
  for (const line of lines) {
    const status = pickupLineStatus(line, tripRows)
    if (status === "done") continue
    if (status === "live") return { error: transferLockReason(line, tripRows) ?? `${line.name} is on a trip.` }
    clear.push(line)
  }

  for (const line of clear) await setTransferLink(line.id, null)
  const settled = await Promise.all(clear.map((line) => waitForLine(line.id, (read) => read.transferToLineId === "")))
  if (!settled.every(Boolean)) return { error: "Bubble is still clearing this request's transfers. Try Close again in a moment." }

  return { touchedRequestIds: [...new Set(clear.flatMap((line) => [line.requestId, line.transferToRequestId]))] }
}

async function ownLinkedLines(lines: readonly MaterialLine[]): Promise<LinkedPickupLines> {
  const linked = lines.filter((line) => line.transferToLineId !== "")
  if (linked.length === 0) return NONE
  return { lines: linked, tripRows: await listTripMaterialsForLines(linked.map((line) => line.id)) }
}

/** One line by id, or `null` if it's gone or a legacy row. */
export async function getMaterialLine(lineId: string): Promise<MaterialLine | null> {
  const [line] = await readStructuredLines([{ key: "_id", constraint_type: "in", value: [lineId] }])
  return line ?? null
}

/**
 * Re-reads one line until `settled` says it's landed, on the `settle.ts`
 * ladder. The `PATCH` is synchronous, but Bubble's search can lag a write by
 * a moment. Returns whether it settled.
 */
export async function waitForLine(lineId: string, settled: (line: MaterialLine) => boolean): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const line = await getMaterialLine(lineId)
    if (line && settled(line)) return true
    if (attempt === RETRY_DELAYS_MS.length) return false
    await sleep(RETRY_DELAYS_MS[attempt])
  }
}
