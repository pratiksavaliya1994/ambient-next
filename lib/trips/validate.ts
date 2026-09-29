/**
 * The one invariant a route has to hold: **a tool is collected before it is
 * dropped.**
 *
 * `planTrip` produces an order that already satisfies this, but its output is
 * only a seed — the dispatcher then drags the stops into the order they
 * actually want to drive, and a drag can break it. So this runs in two places:
 * in the builder on every drag, to flag the offending stop inline; and in the
 * server action immediately before the write, because a server action is
 * reachable by direct POST and the browser's check is not a boundary.
 *
 * The action **rejects** rather than silently re-planning. Quietly reordering a
 * dispatcher's route would save something nobody chose.
 *
 * Not `server-only`, same as `lib/trips/plan.ts` and for the same reason.
 */

import { isManualStopKey } from "@/lib/trips/manual-stops"
import type { PlannedItem, PlannedMaterial, PlannedStop } from "@/lib/trips/plan-types"

export type PlanProblem =
  | { kind: "empty"; message: string }
  | { kind: "order"; message: string; item: PlannedItem }
  | { kind: "dangling"; message: string; item: PlannedItem }
  | { kind: "material-order"; message: string; material: PlannedMaterial }
  | { kind: "material-dangling"; message: string; material: PlannedMaterial }
  | { kind: "duplicate-stop-key"; message: string }
  | { kind: "duplicate-tool"; message: string; toolId: string }
  | { kind: "duplicate-line"; message: string; lineId: string }
  | { kind: "orphan-stop"; message: string; stopKey: string }

/** Anything carried between two stops — a tool or a material line. */
type Routed = Pick<PlannedItem, "fromStopKey" | "toStopKey">

type Placement = "ok" | "dangling" | "order"

/** Where one row stands against the stop order: both stops present, and collect strictly first. */
function placementOf(seq: ReadonlyMap<string, number>, row: Routed): Placement {
  const from = seq.get(row.fromStopKey)
  const to = seq.get(row.toStopKey)
  if (from === undefined || to === undefined) return "dangling"
  return from >= to ? "order" : "ok"
}

/**
 * Items whose collect stop does not strictly precede their drop stop — the
 * check the sortable list runs on every drag.
 *
 * A missing `stopKey` counts as a violation rather than being skipped: an item
 * pointing at a stop that is not in the list is at least as broken as one in
 * the wrong order, and silently ignoring it would let a save through that
 * writes an unreachable row.
 */
export function orderViolations<T extends Routed>(stops: readonly PlannedStop[], items: readonly T[]): T[] {
  const seq = seqByKey(stops)
  return items.filter((item) => placementOf(seq, item) !== "ok")
}

/** The stop keys an order violation implicates, tools and materials alike, for highlighting in the UI. */
export function violatingStopKeys(
  stops: readonly PlannedStop[],
  items: readonly PlannedItem[],
  materials: readonly PlannedMaterial[] = []
): Set<string> {
  const keys = new Set<string>()
  for (const row of [...orderViolations(stops, items), ...orderViolations(stops, materials)]) {
    keys.add(row.fromStopKey)
    keys.add(row.toStopKey)
  }
  return keys
}

/**
 * Everything the server checks before writing a plan. Returns the problems
 * rather than throwing, so the action can turn them into one readable message.
 *
 * An **empty** plan is a problem, not a no-op: a trip with no tools is a driver
 * sent nowhere, and it would also hold no claims, so nothing would stop the
 * same tools going out on a second trip. A draft of **manual stops alone** is
 * allowed — the cargo is added in edit later — and `startTripAction` is what
 * refuses to send it out empty.
 */
export function validatePlan(
  stops: readonly PlannedStop[],
  items: readonly PlannedItem[],
  materials: readonly PlannedMaterial[] = []
): PlanProblem[] {
  const problems: PlanProblem[] = []

  if (items.length === 0 && materials.length === 0 && !stops.some((stop) => isManualStopKey(stop.stopKey))) {
    problems.push({ kind: "empty", message: "Add at least one tool, material or stop before saving this trip." })
  }

  const seen = new Set<string>()
  for (const stop of stops) {
    if (seen.has(stop.stopKey)) {
      problems.push({
        kind: "duplicate-stop-key",
        message: `Two stops share the key ${stop.stopKey}. Reload the builder and try again.`,
      })
    }
    seen.add(stop.stopKey)
  }

  // **One tool, one journey.** A tool double-booked across two open requests —
  // which `isFreeToAssign` permits, since it counts `Pickup Requested` as free
  // — yields a movement under *each* of them, and selection is keyed by tool id,
  // so the two rows share one checkbox. Nothing above catches the result: both
  // movements are individually well-formed, and they route to different stops,
  // so the order and orphan checks pass.
  //
  // The write it would produce is the thing worth refusing: two `triptool` rows
  // for one physical object, a run sheet telling the driver to drop the same
  // tool in two places, and a collect that can only satisfy one of them.
  //
  // `oneJourney` now reconciles the cases that *have* an answer before a plan
  // is ever built — a pickup leg superseded by a delivery from the same site is
  // one drive, not a conflict — so what reaches here is the case with none: two
  // deliveries pulling one tool towards two different jobs. That has no route,
  // and the fix is not on this screen; the dispatcher has to unassign the tool
  // from one request. So the message says which two places are fighting over it.
  // The check stays whole rather than being narrowed to that case: it is the
  // last thing between a selection and the write, and it is reachable by direct
  // POST, where nothing guarantees `selectMovements` ran at all.
  const itemsByTool = new Map<string, PlannedItem[]>()
  for (const item of items) {
    itemsByTool.set(item.toolId, [...(itemsByTool.get(item.toolId) ?? []), item])
  }
  for (const [toolId, dupes] of itemsByTool) {
    if (dupes.length < 2) continue
    const destinations = [...new Set(dupes.map((item) => item.toLocation))].sort((a, b) => a.localeCompare(b))
    problems.push({
      kind: "duplicate-tool",
      toolId,
      message:
        destinations.length > 1
          ? `${dupes[0].toolName} is assigned to two requests at once — this trip would drop it at both ${destinations.join(" and ")}. Unassign it from one of them first.`
          : `${dupes[0].toolName} is on this trip twice. Unassign it from one of its requests first.`,
    })
  }

  // **One row per line per trip.** Two partial loads of one line on one trip
  // are one row with the summed qty — the complete-stop lists address a row by
  // its line id, so a second row would take the same outcome without ever
  // being asked. `selectMaterialMovements` never emits two; a direct POST can.
  const lineCounts = new Map<string, number>()
  for (const material of materials) lineCounts.set(material.lineId, (lineCounts.get(material.lineId) ?? 0) + 1)
  for (const [lineId, count] of lineCounts) {
    if (count < 2) continue
    const name = materials.find((material) => material.lineId === lineId)?.name ?? "A material"
    problems.push({ kind: "duplicate-line", lineId, message: `${name} is on this trip twice. Send it as one line.` })
  }

  const seq = seqByKey(stops)
  for (const item of items) {
    const placement = placementOf(seq, item)
    if (placement === "dangling") {
      problems.push({ kind: "dangling", message: `${item.toolName} points at a stop that isn't on this trip.`, item })
    } else if (placement === "order") {
      problems.push({
        kind: "order",
        message: `${item.toolName} is dropped at ${item.toLocation} before it's collected at ${item.fromLocation}.`,
        item,
      })
    }
  }
  for (const material of materials) {
    const placement = placementOf(seq, material)
    if (placement === "dangling") {
      problems.push({
        kind: "material-dangling",
        message: `${material.name} points at a stop that isn't on this trip.`,
        material,
      })
    } else if (placement === "order") {
      problems.push({
        kind: "material-order",
        message: `${material.name} is dropped at ${material.toLocation} before it's collected at ${material.fromLocation}.`,
        material,
      })
    }
  }

  // A stop nothing collects from and nothing drops at is a place the driver
  // would visit for no reason. Cheap to catch, and it means a stop can never be
  // stranded by removing the last tool or material that justified it. A manual
  // stop is the exception: the dispatcher asked for that visit by name.
  const used = new Set<string>()
  for (const row of [...items, ...materials]) {
    used.add(row.fromStopKey)
    used.add(row.toStopKey)
  }
  for (const stop of stops) {
    if (!used.has(stop.stopKey) && !isManualStopKey(stop.stopKey)) {
      problems.push({
        kind: "orphan-stop",
        message: `Nothing is picked up or dropped at ${stop.location}.`,
        stopKey: stop.stopKey,
      })
    }
  }

  return problems
}

function seqByKey(stops: readonly PlannedStop[]): Map<string, number> {
  return new Map(stops.map((stop) => [stop.stopKey, stop.seq]))
}
