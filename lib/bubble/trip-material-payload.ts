import "server-only"

import { z } from "zod"

import type { PlannedMaterial } from "@/lib/trips/plan-types"

/**
 * The material half of what `trips.ts` sends and checks, plus the plan and
 * start count checks that now include materials. It lives in its own file so
 * `trips.ts` stays under its 300-line cap.
 *
 * Every material list the workflows take holds **line ids**
 * (`tripmaterial.lineID`), never row ids. Bubble finds the row by trip and line,
 * and that pair is unique because `validatePlan` refuses `duplicate-line`.
 */

/** One `create-trip-material` object, via Detect Data. Every field text except `qty`. */
export function materialPayload(material: PlannedMaterial) {
  return {
    lineId: material.lineId,
    requestId: material.requestId,
    materialId: material.materialId ?? "",
    name: material.name,
    unit: material.unit,
    kind: material.kind,
    qty: material.qty,
    fromStopKey: material.fromStopKey,
    fromLocation: material.fromLocation,
    toStopKey: material.toStopKey,
    toLocation: material.toLocation,
  }
}

/**
 * What `create-trip` / `save-trip` return. `materials` is optional and read as
 * 0, so a tools-only call is checked exactly as before 5D.
 */
export const planResultShape = { stops: z.number(), items: z.number(), materials: z.number().optional() }

export function assertPlanCounts(
  result: { stops: number; items: number; materials?: number },
  stops: number,
  items: number,
  materials: number
): void {
  const saved = result.materials ?? 0
  if (result.stops !== stops || result.items !== items || saved !== materials) {
    throw new Error(
      `Bubble saved ${result.stops} of ${stops} stops, ${result.items} of ${items} tools and ${saved} of ${materials} material lines. ` +
        `Save again — it replaces the whole plan rather than adding to it.`
    )
  }
}

const startResult = z.looseObject({ materials: z.number().optional() })

/** `start-trip` returns `materials` = the lines it was sent, read as 0 when absent. */
export function assertStartCounts(raw: unknown, sent: number): void {
  const loaded = startResult.parse(raw).materials ?? 0
  if (loaded !== sent) throw new Error(`Bubble loaded ${loaded} of ${sent} material lines. Reload the trip.`)
}

/** The five `complete-trip-stop` material lists — `CompleteStopInput`'s tool lists, one for one. */
export type MaterialStopLists = {
  /** Loaded lines landing here. At a job this credits site stock, asynchronously (`drop-material-at-site`). */
  dropMaterialIds: readonly string[]
  loadMaterialIds: readonly string[]
  /** Lines the driver couldn't take at their collect stop. */
  skipMaterialIds: readonly string[]
  /** Lines this site turned away. They stay on the truck. */
  refuseMaterialIds: readonly string[]
  /** Refused lines unloaded at the yard. Inventory goes back into stock, asynchronously (`return-material-stock`). */
  returnMaterialIds: readonly string[]
}

export const NO_MATERIAL_STOP_LISTS: MaterialStopLists = {
  dropMaterialIds: [],
  loadMaterialIds: [],
  skipMaterialIds: [],
  refuseMaterialIds: [],
  returnMaterialIds: [],
}

export function materialStopPayload(lists: MaterialStopLists) {
  return {
    dropMaterialIds: [...lists.dropMaterialIds],
    loadMaterialIds: [...lists.loadMaterialIds],
    skipMaterialIds: [...lists.skipMaterialIds],
    refuseMaterialIds: [...lists.refuseMaterialIds],
    returnMaterialIds: [...lists.returnMaterialIds],
  }
}

/**
 * The five count keys `complete-trip-stop` returns, each the `:count` of the
 * list sent. **Optional, read as 0**: a missing key with an empty list is fine,
 * and with a non-empty list `assertMaterialStopCounts` fails. That is the only
 * case that says Bubble ignored the materials.
 */
export const materialStopResultShape = {
  materialsDropped: z.number().optional(),
  materialsLoaded: z.number().optional(),
  materialsSkipped: z.number().optional(),
  materialsRefused: z.number().optional(),
  materialsReturned: z.number().optional(),
}

export type MaterialStopCounts = {
  materialsDropped: number
  materialsLoaded: number
  materialsSkipped: number
  materialsRefused: number
  materialsReturned: number
}

type MaterialStopResult = { [Key in keyof MaterialStopCounts]?: number }

/** Checks each count against the list sent, and returns them with missing keys read as 0. */
export function assertMaterialStopCounts(result: MaterialStopResult, lists: MaterialStopLists): MaterialStopCounts {
  const counts: MaterialStopCounts = {
    materialsDropped: result.materialsDropped ?? 0,
    materialsLoaded: result.materialsLoaded ?? 0,
    materialsSkipped: result.materialsSkipped ?? 0,
    materialsRefused: result.materialsRefused ?? 0,
    materialsReturned: result.materialsReturned ?? 0,
  }
  const checks: [number, number, string][] = [
    [counts.materialsDropped, lists.dropMaterialIds.length, "dropped"],
    [counts.materialsLoaded, lists.loadMaterialIds.length, "collected"],
    [counts.materialsSkipped, lists.skipMaterialIds.length, "skipped"],
    [counts.materialsRefused, lists.refuseMaterialIds.length, "refused"],
    [counts.materialsReturned, lists.returnMaterialIds.length, "returned"],
  ]
  for (const [actual, expected, noun] of checks) {
    if (actual !== expected) {
      throw new Error(`Bubble ${noun} ${actual} of ${expected} material lines. Reload the trip and check what landed.`)
    }
  }
  return counts
}
