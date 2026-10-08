import { isLinkedTransfer, isStalePlan, lineProgress, type MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { LineTripRow } from "@/lib/bubble/trip-materials-types"
import type { ToolTripState } from "@/lib/dispatch/tool-state"

/**
 * One material line on the request page, split into the trip states a tool
 * can be in — so "2 gal on the truck" reads with the same flag and colour as
 * a tool on the truck. A tool is in one state; a line's units can be in
 * several at once (some delivered, some still in the yard), so it comes back
 * as one chunk per state that holds any. Client-safe and pure.
 *
 * The states mean what they mean for tools (`ToolTripState`), read off the
 * line's own `tripmaterial` rows:
 *
 * - **Delivery:** `Dropped` → delivered, `Loaded` → carried, `Refused` →
 *   refused and riding home. What no trip holds is in the yard: plain, or
 *   `refused` / `left-behind` when the newest trip row turned it away or
 *   skipped it — the same newest-row-wins rule as `lineTripFlags`.
 * - **Pickup:** what's still on site is a collect to make (`pending-pickup`),
 *   or `left-behind` once a trip skipped it. Collected units are carried, then
 *   returned at the yard — or delivered, for a transfer that reached its site.
 *   A transfer the site turned away is refused.
 */
export type LineChunk = { state: ToolTripState | null; qty: number; detail: string }

export function lineTripChunks(line: MaterialLine, rows: readonly LineTripRow[], pickup: boolean): LineChunk[] {
  const own = rows.filter((row) => row.lineId === line.id && !isStalePlan(row))
  const latest = own.at(-1)
  return (pickup ? pickupChunks(line, own, rows, latest) : deliveryChunks(line, own, latest)).filter(
    (chunk) => chunk.qty > 0
  )
}

const sum = (rows: readonly LineTripRow[], qty: (row: LineTripRow) => number) =>
  rows.reduce((total, row) => total + qty(row), 0)
const planned = (row: LineTripRow) => row.qty
const counted = (row: LineTripRow) => row.actualQty ?? row.qty
const inState = (rows: readonly LineTripRow[], state: LineTripRow["state"]) =>
  rows.filter((row) => row.state === state)

function deliveryChunks(line: MaterialLine, own: LineTripRow[], latest: LineTripRow | undefined): LineChunk[] {
  const inYard = lineProgress(line, own).outstanding
  // The newest row decides how the units back in the yard read — the trip that
  // turned them away or left them behind. The rest just haven't gone yet.
  const turnedBack = latest?.state === "Returned" ? Math.min(latest.qty, inYard) : 0
  const skipped = latest?.state === "Skipped" ? Math.min(latest.qty, inYard) : 0

  return [
    { state: "delivered", qty: sum(inState(own, "Dropped"), planned), detail: "Already delivered — nothing left to move" },
    { state: "carried", qty: sum(inState(own, "Loaded"), planned), detail: "Already loaded — on the truck to the site" },
    {
      state: "refused",
      qty: sum(inState(own, "Refused"), planned),
      detail: "The site turned it away — on its way back to the warehouse",
    },
    { state: "refused", qty: turnedBack, detail: "The site turned it away — back at the warehouse, still to deliver" },
    { state: "left-behind", qty: skipped, detail: "Left at the warehouse — not loaded on the last trip" },
    { state: null, qty: sum(inState(own, "Planned"), planned), detail: "At the warehouse — planned on a trip" },
    { state: null, qty: inYard - turnedBack - skipped, detail: "At the warehouse — not on a trip yet" },
  ]
}

function pickupChunks(
  line: MaterialLine,
  own: LineTripRow[],
  rows: readonly LineTripRow[],
  latest: LineTripRow | undefined
): LineChunk[] {
  const target = isLinkedTransfer(line) ? line.transferToLocation : "the warehouse"
  const dropped = inState(own, "Dropped")
  const atTarget = isLinkedTransfer(line) ? dropped.filter((row) => row.toLocation === target) : []
  const onSite = lineProgress(line, rows, { pickup: true }).outstanding
  const skipped = latest?.state === "Skipped"

  return [
    { state: "delivered", qty: sum(atTarget, counted), detail: `Already delivered to ${target} — nothing left to move` },
    {
      state: "returned",
      qty: sum(dropped, counted) - sum(atTarget, counted),
      detail: "Already back at the warehouse — nothing left to move",
    },
    { state: "carried", qty: sum(inState(own, "Loaded"), counted), detail: `Already collected — on the truck to ${target}` },
    {
      state: "refused",
      qty: sum(inState(own, "Refused"), counted),
      detail: `${target} turned it away — on its way back to the warehouse`,
    },
    { state: "refused", qty: sum(inState(own, "Returned"), counted), detail: `${target} turned it away — back at the warehouse` },
    { state: "pending-pickup", qty: sum(inState(own, "Planned"), planned), detail: "On site — planned on a trip, to collect" },
    {
      state: skipped ? "left-behind" : "pending-pickup",
      qty: onSite,
      detail: skipped ? "Left on site — not picked up on the last trip" : "On site — not on a trip yet",
    },
  ]
}
