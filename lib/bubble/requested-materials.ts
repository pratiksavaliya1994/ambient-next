import "server-only"

import { z } from "zod"

import { bubbleListAll, bubbleRunWorkflow, type Constraint } from "@/lib/bubble/client"
import { listMaterialItemsByIds } from "@/lib/bubble/material-items"
import {
  MATERIAL_KIND,
  type MaterialLine,
  type ResolvedMaterialLine,
} from "@/lib/bubble/requested-materials-types"
import type { MaterialLineInput } from "@/lib/schemas/material"
import { RETRY_DELAYS_MS, sleep } from "@/lib/trips/settle"

/**
 * Reading a request's material lines, and assigning them.
 *
 * `requestedmaterials` now holds two kinds of row side by side, told apart by
 * `kind`:
 *
 * - **structured lines** (`kind` set) — one per line a form sent in
 *   `materialLines`;
 * - **legacy rows** (`kind` empty) — the pre-phase-5 free text, and the one
 *   `new-request` still writes for any request with materials text, whether
 *   or not it was sent any lines (5B §1.4). With lines, that text is their
 *   summary. That step can't be removed from here and isn't a bug.
 *
 * So the read rule is load-bearing: **a request's legacy text is dropped when it
 * has any structured line** — otherwise every new request would show its
 * materials twice, once as lines and once as the summary text.
 *
 * Split out of `lib/bubble/requests.ts`, which is far past the 300-line cap.
 */

export const REQUESTED_MATERIALS = "requestedmaterials"
const ASSIGN_MATERIALS_WORKFLOW = "assign-request-materials"

const requestedMaterialsRow = z.looseObject({
  _id: z.string(),
  "Created Date": z.string().optional(),
  requestID: z.string().optional(),
  materials: z.string().optional(),
  kind: z.enum(MATERIAL_KIND).optional(),
  materialID: z.string().optional(),
  name: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.number().optional(),
  assignedQty: z.number().optional(),
  // 5F transfers. Text ids and a job name, written only by `setTransferLink`.
  transferToLineID: z.string().optional(),
  transferToRequestID: z.string().optional(),
  transferToLocation: z.string().optional(),
})

/** The legacy `materials` field is one line per item, free text — no `Name: qty` structure to lean on. */
export function parseMaterialsList(text: string | undefined): string[] {
  if (!text) return []
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export type RequestMaterials = {
  /** Structured lines, in the order they were created. */
  lines: MaterialLine[]
  /** Legacy free text, one entry per line. Always empty when `lines` isn't. */
  legacy: string[]
}

const EMPTY: RequestMaterials = { lines: [], legacy: [] }

/** Every request's materials, keyed by request id, from one paginated `in` query. */
export async function listMaterialLines(requestIds: readonly string[]): Promise<Map<string, RequestMaterials>> {
  const byRequest = new Map<string, RequestMaterials>()
  if (requestIds.length === 0) return byRequest

  const rows = await bubbleListAll(REQUESTED_MATERIALS, {
    constraints: [{ key: "requestID", constraint_type: "in", value: [...new Set(requestIds)] }],
    sortField: "Created Date",
    descending: false,
  })

  for (const raw of rows) {
    const row = requestedMaterialsRow.parse(raw)
    if (!row.requestID) continue

    const bucket = byRequest.get(row.requestID) ?? { lines: [], legacy: [] }
    if (row.kind) bucket.lines.push(toMaterialLine(row, row.requestID, row.kind))
    else bucket.legacy.push(...parseMaterialsList(row.materials))
    byRequest.set(row.requestID, bucket)
  }

  for (const [id, bucket] of byRequest) {
    if (bucket.lines.length > 0) byRequest.set(id, { lines: bucket.lines, legacy: [] })
  }
  return byRequest
}

/** `listMaterialLines` for one request. */
export async function getMaterialLines(requestId: string): Promise<RequestMaterials> {
  return (await listMaterialLines([requestId])).get(requestId) ?? EMPTY
}

function toMaterialLine(
  row: z.infer<typeof requestedMaterialsRow>,
  requestId: string,
  kind: MaterialLine["kind"]
): MaterialLine {
  return {
    id: row._id,
    requestId,
    kind,
    materialId: row.materialID || null,
    name: row.name?.trim() || row.materials?.trim() || "(unnamed)",
    unit: row.unit?.trim() || null,
    // Zero is what Bubble can hand back for a number sent blank; on a line it
    // can only mean "one lot", never "none wanted".
    quantity: row.quantity && row.quantity > 0 ? row.quantity : null,
    assignedQty: row.assignedQty ?? 0,
    transferToLineId: row.transferToLineID?.trim() ?? "",
    transferToRequestId: row.transferToRequestID?.trim() ?? "",
    transferToLocation: row.transferToLocation?.trim() ?? "",
  }
}

/**
 * Structured lines matching `constraints`, oldest first — legacy rows dropped.
 * For reads that aren't by request: the transfer sources (by item) and the
 * linked pickup lines (by `transferToLineID`).
 */
export async function readStructuredLines(constraints: Constraint[]): Promise<MaterialLine[]> {
  const rows = await bubbleListAll(REQUESTED_MATERIALS, { constraints, sortField: "Created Date", descending: false })
  return rows.flatMap((raw) => {
    const row = requestedMaterialsRow.parse(raw)
    return row.kind && row.requestID ? [toMaterialLine(row, row.requestID, row.kind)] : []
  })
}

export type ResolveResult = { ok: true; lines: ResolvedMaterialLine[] } | { ok: false; message: string }

/**
 * Turns what a form sent into lines worth writing. Inventory lines take their
 * `name` and `unit` from a **fresh** catalogue read — never from the browser —
 * and an unknown or retired item refuses the whole submit, by name where it
 * has one.
 */
export async function resolveMaterialLines(inputs: readonly MaterialLineInput[]): Promise<ResolveResult> {
  const ids = inputs.flatMap((input) => (input.kind === "Inventory" ? [input.materialId] : []))
  const items = new Map((await listMaterialItemsByIds(ids)).map((item) => [item.id, item]))

  const lines: ResolvedMaterialLine[] = []
  for (const input of inputs) {
    if (input.kind === "NonInventory") {
      lines.push({
        kind: "NonInventory",
        materialId: null,
        name: input.name,
        unit: input.unit || null,
        quantity: input.quantity,
      })
      continue
    }

    const item = items.get(input.materialId)
    if (!item) return { ok: false, message: "One of the materials is no longer in the catalogue. Pick it again." }
    if (!item.active) return { ok: false, message: `${item.name} has been retired from the catalogue. Remove it.` }
    lines.push({
      kind: "Inventory",
      materialId: item.id,
      name: item.name,
      unit: item.unit || null,
      quantity: input.quantity,
    })
  }
  return { ok: true, lines }
}

export type MaterialTarget = { lineId: string; targetQty: number }

const assignResult = z.looseObject({ lines: z.number() })

/**
 * `POST /wf/assign-request-materials` — sets each line's `assignedQty` to its
 * target, drawing or returning stock inside Bubble.
 *
 * **Targets, never deltas.** `client.ts` retries a POST up to four times; a
 * replayed target computes a zero change and writes nothing, where a replayed
 * delta would draw the stock twice. Don't add a delta variant.
 *
 * `release` only from Close request: it sets the history reason to `Release`.
 * The fan-out is asynchronous — follow with `waitForMaterialLines`.
 */
export async function assignMaterials(
  requestId: string,
  targets: readonly MaterialTarget[],
  byName: string,
  { release = false } = {}
): Promise<void> {
  if (targets.length === 0) return

  const raw = await bubbleRunWorkflow(ASSIGN_MATERIALS_WORKFLOW, {
    requestId,
    byName,
    release,
    lines: targets.map(({ lineId, targetQty }) => ({ lineId, targetQty })),
  })
  const sent = assignResult.parse(raw).lines

  if (sent !== targets.length) {
    throw new Error(`Bubble accepted ${sent} of ${targets.length} material lines. Reload and check what landed.`)
  }
}

/**
 * Re-reads one request's lines until `settled` says they've landed, or the
 * `lib/trips/settle.ts` ladder runs out (about five seconds).
 *
 * Both writers here fan out through *Schedule API Workflow on a list*, which
 * returns once the runs are **queued** — so the count they send back is what
 * was sent, not what was written. Returns the last read either way; not
 * settling is a warning for the caller, not a failure.
 */
export async function waitForMaterialLines(
  requestId: string,
  settled: (lines: readonly MaterialLine[]) => boolean
): Promise<{ settled: boolean; lines: MaterialLine[] }> {
  for (let attempt = 0; ; attempt++) {
    const { lines } = await getMaterialLines(requestId)
    if (settled(lines)) return { settled: true, lines }
    if (attempt === RETRY_DELAYS_MS.length) return { settled: false, lines }
    await sleep(RETRY_DELAYS_MS[attempt])
  }
}

/**
 * After a create: waits for the structured lines to land and names a shortfall.
 * A warning, never an error — the request row exists by the time this runs.
 */
export async function materialLinesWarning(requestId: string, expected: number): Promise<string | undefined> {
  if (expected === 0) return undefined
  try {
    const { settled, lines } = await waitForMaterialLines(requestId, (landed) => landed.length >= expected)
    if (settled) return undefined
    return `The request was created, but only ${lines.length} of ${expected} material lines have shown up yet. Reload the request to check.`
  } catch {
    return "The request was created, but its material lines couldn't be checked. Reload the request to check."
  }
}

/** Whether every target is what Bubble now holds. */
export function targetsLanded(targets: readonly MaterialTarget[]) {
  return (lines: readonly MaterialLine[]) =>
    targets.every((target) => lines.find((line) => line.id === target.lineId)?.assignedQty === target.targetQty)
}
