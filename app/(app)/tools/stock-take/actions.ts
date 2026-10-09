"use server"

import { revalidatePath } from "next/cache"

import { displayNameOf, requireSession } from "@/lib/auth/session"
import { isWarehouseLocation } from "@/lib/bubble/enums"
import { isKnownToolLocation } from "@/lib/bubble/reference"
import {
  findStockTakeHolds,
  readStockTakeTools,
  writeStockTake,
  type StockTakePatch,
} from "@/lib/bubble/stock-take"
import { stockTakeSaveSchema } from "@/lib/schemas/stock-take"
import {
  lockReasonOf,
  stockTakeActor,
  stockTakeStatusFor,
  type StockTakeOutcome,
  type StockTakeState,
  type StockTakeTool,
} from "@/lib/tools/stock-take"

/**
 * Records where the ticked tools physically are: each is put at `location`
 * with the `statusNew` a trip drop there would write (`stockTakeStatusFor` —
 * `Available` at the warehouse, `Delivered` on a job site).
 *
 * Floor is cleared at a warehouse: there is no floor there, and a leftover one
 * is residue the dashboards are told to ignore.
 */
export async function saveStockTakeAction(input: unknown): Promise<StockTakeState> {
  const session = await requireSession()

  const parsed = stockTakeSaveSchema.safeParse(input)
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid stock take." }
  const { location, toolIds, condition } = parsed.data

  if (!(await isKnownToolLocation(location))) {
    return { status: "error", message: "That location isn't a job or a warehouse. Pick one from the list." }
  }
  const floor = isWarehouseLocation(location) ? "" : parsed.data.floor
  const status = stockTakeStatusFor(location)

  return runStockTake(toolIds, displayNameOf(session), (tool) => {
    const patch: StockTakePatch = {}
    if (tool.location !== location) patch.location = location
    if (tool.floor !== floor) patch.floor = floor
    if (tool.status !== status) patch.statusNew = status
    if (tool.currentUser !== "") patch.currentUser = ""
    if (condition !== "" && tool.condition !== condition) patch.condition = condition
    return patch
  })
}

/**
 * Tools per guarded step. Each step re-reads its tools and re-checks their
 * claims immediately before writing them, so the gap between "nothing holds
 * this tool" and the write is a few seconds — not the half-minute a whole
 * warehouse takes. Same posture as `updateToolAction`; Bubble has no
 * transactions, so the window can be narrowed, never closed.
 */
const GUARD_CHUNK = 25

/** Which `StockTakeTool` field each patch key lands in, for the read-back. */
const LANDS_IN: Partial<Record<keyof StockTakePatch, (tool: StockTakeTool) => string>> = {
  location: (tool) => tool.location,
  floor: (tool) => tool.floor,
  statusNew: (tool) => tool.status,
  currentUser: (tool) => tool.currentUser,
  condition: (tool) => tool.condition,
}

/**
 * Re-read, re-guard, write, read back — over a batch. Held tools are skipped
 * and named rather than refusing the whole batch, so one forgotten trip doesn't
 * block a warehouse count. The read-back matters because Bubble ignores an
 * option-set value it doesn't recognise without erroring.
 */
async function runStockTake(
  toolIds: string[],
  name: string,
  buildPatch: (tool: StockTakeTool) => StockTakePatch
): Promise<StockTakeState> {
  const ids = [...new Set(toolIds)]
  const outcomes = new Map<string, StockTakeOutcome>()
  const written: { toolId: string; name: string; patch: StockTakePatch }[] = []

  try {
    for (let i = 0; i < ids.length; i += GUARD_CHUNK) {
      const chunk = ids.slice(i, i + GUARD_CHUNK)
      const [tools, holds] = await Promise.all([readStockTakeTools(chunk), findStockTakeHolds(chunk)])

      const writes: typeof written = []
      for (const id of chunk) {
        const tool = tools.get(id)
        const lock = tool && lockReasonOf(tool, holds)
        if (!tool) outcomes.set(id, { toolId: id, name: id, result: "failed", detail: "No such tool any more." })
        else if (lock) outcomes.set(id, { toolId: id, name: tool.name, result: "held", detail: lock })
        else {
          const patch = buildPatch(tool)
          // Already right — writing it anyway would only add an empty `toolshistory` row.
          if (Object.keys(patch).length === 0) outcomes.set(id, { toolId: id, name: tool.name, result: "saved" })
          else writes.push({ toolId: id, name: tool.name, patch })
        }
      }

      const failures = await writeStockTake(writes, stockTakeActor(name))
      for (const write of writes) {
        const failure = failures.get(write.toolId)
        if (failure) outcomes.set(write.toolId, { toolId: write.toolId, name: write.name, result: "failed", detail: failure })
        else written.push(write)
      }
    }

    const after = await readStockTakeTools(written.map((write) => write.toolId))
    for (const { toolId, name: toolName, patch } of written) {
      const failure = unapplied(after.get(toolId), patch)
      outcomes.set(
        toolId,
        failure ? { toolId, name: toolName, result: "failed", detail: failure } : { toolId, name: toolName, result: "saved" }
      )
    }
  } catch (error) {
    // Earlier chunks may already be written; say so rather than implying nothing happened.
    const message = error instanceof Error ? error.message : "Unknown error"
    return {
      status: "error",
      message: `Couldn't finish the save (${written.length} tools were already written): ${message}`,
    }
  } finally {
    revalidatePath("/tools", "layout")
  }

  return { status: "done", outcomes: ids.map((id) => outcomes.get(id)!) }
}

function unapplied(tool: StockTakeTool | undefined, patch: StockTakePatch): string | undefined {
  if (!tool) return "Couldn't read the tool back after saving."
  const missed = (Object.keys(patch) as (keyof StockTakePatch)[]).filter((key) => {
    const read = LANDS_IN[key]
    return read !== undefined && read(tool) !== patch[key]
  })
  return missed.length > 0 ? `Saved, but ${missed.join(", ")} didn't take.` : undefined
}
