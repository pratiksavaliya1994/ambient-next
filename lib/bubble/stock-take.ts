import "server-only"

import { z } from "zod"

import { listRequestClaims } from "@/lib/bubble/assigned-tools"
import { bubbleListAll, bubblePatch, describeBubbleError } from "@/lib/bubble/client"
import { listToolTypes } from "@/lib/bubble/reference"
import type { ToolPatch } from "@/lib/bubble/tool-detail"
import type { ToolStatusNew } from "@/lib/bubble/tool-enums"
import { listToolClaims } from "@/lib/bubble/trips-read"
import type { StockTakeTool } from "@/lib/tools/stock-take"

/**
 * The stock take's Bubble half: reading tools, checking what holds them, and
 * writing a batch back. See `lib/tools/stock-take.ts` for the rules.
 *
 * Writes are plain `PATCH`es, one row at a time, because the Data API has no
 * bulk write. A `/wf/` fan-out would
 * be one call, but it returns once the runs are *queued*, so nothing could be
 * read back and confirmed per tool.
 */

const TOOLS = "tools"

/** Ids per `in` lookup. The whole warehouse in one query string is ~8KB of ids. */
const ID_CHUNK = 50

/**
 * The tool detail page's `ToolPatch`, except `statusNew` may also be
 * `Delivered`. That page can only release a tool; a stock take also lands one
 * on a job site, and writes what a trip drop there would (`stockTakeStatusFor`).
 * Kept apart so `ToolPatch` stays release-only.
 */
export type StockTakePatch = Omit<ToolPatch, "statusNew"> & { statusNew?: ToolStatusNew }

/** PATCHes in flight at once. `client.ts` retries 429s, so this only keeps us polite. */
const WRITE_CONCURRENCY = 5

const toolRow = z.looseObject({
  _id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  floor: z.string().optional(),
  statusNew: z.string().optional(),
  condition: z.string().optional(),
  currentUser: z.string().optional(),
})

async function toStockTakeTools(rows: unknown[]): Promise<StockTakeTool[]> {
  const typeNameById = new Map((await listToolTypes()).map((type) => [type.id, type.name]))
  return rows
    .map((raw) => toolRow.parse(raw))
    .filter((row) => row.name)
    .map((row) => ({
      id: row._id,
      name: row.name!.trim(),
      typeName: row.type ? (typeNameById.get(row.type) ?? null) : null,
      location: row.location?.trim() ?? "",
      floor: row.floor?.trim() ?? "",
      status: row.statusNew ?? "",
      condition: row.condition ?? "",
      currentUser: row.currentUser?.trim() ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Every tool. Never memoised — this is exactly what changes while people count. */
export async function listStockTakeTools(): Promise<StockTakeTool[]> {
  return toStockTakeTools(await bubbleListAll(TOOLS))
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += ID_CHUNK) out.push(items.slice(i, i + ID_CHUNK))
  return out
}

/** A fresh read of just these tools, for the re-guard before writing and the read-back after. */
export async function readStockTakeTools(ids: readonly string[]): Promise<Map<string, StockTakeTool>> {
  const pages = await Promise.all(
    chunks(ids).map((part) =>
      bubbleListAll(TOOLS, { constraints: [{ key: "_id", constraint_type: "in", value: part }] })
    )
  )
  return new Map((await toStockTakeTools(pages.flat())).map((tool) => [tool.id, tool]))
}

/**
 * Why each held tool is held, keyed by tool id. The same two claim reads the
 * tool detail page gates on (`readToolHold`), batched — a stock take must not
 * move a tool an open trip or open request still has.
 */
export async function findStockTakeHolds(ids: readonly string[]): Promise<Map<string, string>> {
  const results = await Promise.all(
    chunks(ids).map((part) => Promise.all([listToolClaims(part), listRequestClaims(part)]))
  )

  const holds = new Map<string, string>()
  for (const [trips, requests] of results) {
    for (const [toolId, request] of requests) holds.set(toolId, `Reserved for ${request.job}`)
    // A trip outranks a request, same as `readToolHold`.
    for (const [toolId, trip] of trips) holds.set(toolId, `On ${trip.driver ?? "a driver"}'s trip`)
  }
  return holds
}

/**
 * Writes each patch, a few at a time. Returns the error per tool that failed;
 * a tool that isn't in the map saved.
 */
export async function writeStockTake(
  patches: ReadonlyArray<{ toolId: string; patch: StockTakePatch }>,
  actor: string
): Promise<Map<string, string>> {
  const failures = new Map<string, string>()
  let next = 0
  const worker = async () => {
    while (next < patches.length) {
      const { toolId, patch } = patches[next++]
      try {
        // `lastEditedBy` on every write — `DB - Tools Change Log` copies it to `doneBy`.
        await bubblePatch(TOOLS, toolId, { ...patch, lastEditedBy: actor })
      } catch (error) {
        failures.set(toolId, describeBubbleError(error))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(WRITE_CONCURRENCY, patches.length) }, worker))
  return failures
}
