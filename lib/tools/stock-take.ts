import { isWarehouseDestination } from "@/lib/bubble/enums"
import { TOOL_STATUS_AVAILABLE, TOOL_STATUS_DELIVERED, type ToolStatusNew } from "@/lib/bubble/tool-enums"
import { normaliseToolName } from "@/lib/tools/tool-name"

/**
 * The stock take: making `tools` rows say where tools physically are. Built
 * for go-live, and kept as the everyday "the record is wrong" fix. It only ever
 * writes what a trip drop would have written, and skips anything a live trip
 * or request holds, so it can't contradict the lifecycle.
 *
 * Pure and client-safe — the page and `saveStockTakeAction` both read these.
 * The Bubble half is `lib/bubble/stock-take.ts`.
 */

/**
 * The `statusNew` a saved tool gets — exactly what a trip drop writes there
 * (`isWarehouseDestination`, the rule that makes a `tripstop` Warehouse-kind).
 * `Delivered` on a job site keeps it out of every assign picker
 * (`isFreeToAssign`), so a tool in use on a site can't be handed to another
 * request; a pickup request is how it comes back, as for any delivered tool.
 */
export function stockTakeStatusFor(location: string): ToolStatusNew {
  return isWarehouseDestination(location) ? TOOL_STATUS_AVAILABLE : TOOL_STATUS_DELIVERED
}

/** Suffix on `tools.lastEditedBy` for every stock-take write, so the tool's history says where the change came from. */
export const STOCK_TAKE_MARK = "(stock take)"

/** Most tools one save may carry. The warehouse alone is ~230. */
export const MAX_STOCK_TAKE_BATCH = 600

export function stockTakeActor(name: string): string {
  return `${name} ${STOCK_TAKE_MARK}`
}

export type StockTakeTool = {
  id: string
  name: string
  typeName: string | null
  /** Raw and trimmed — `""` when blank, never the `NO_LOCATION` sentinel. */
  location: string
  floor: string
  status: string
  condition: string
  /** A driver's name left by dispatch. Cleared on save — `Available` means nobody has it. */
  currentUser: string
}

export type PasteMatch = {
  /** Tools a pasted line named unambiguously. */
  matched: string[]
  /** Lines that named no tool — shown, never written. */
  unmatched: string[]
  /** Lines naming more than one tool (`tools.name` isn't unique). Picked by hand from the list. */
  ambiguous: string[]
}

/**
 * One tool name per line, matched trimmed and case-folded with **equality**.
 * No fuzzy matching on purpose: a near-miss is exactly the drift this page
 * exists to stop, so it is reported rather than guessed at.
 */
export function matchPastedNames(text: string, tools: StockTakeTool[]): PasteMatch {
  const byName = new Map<string, string[]>()
  for (const tool of tools) {
    const key = normaliseToolName(tool.name)
    byName.set(key, [...(byName.get(key) ?? []), tool.id])
  }

  const result: PasteMatch = { matched: [], unmatched: [], ambiguous: [] }
  const lines = [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
  for (const line of lines) {
    const ids = byName.get(normaliseToolName(line)) ?? []
    if (ids.length === 1) result.matched.push(ids[0])
    else if (ids.length === 0) result.unmatched.push(line)
    else result.ambiguous.push(line)
  }
  return result
}

export type StockTakeSummary = {
  /** Recorded somewhere else now. */
  moving: number
  /** Already recorded here — the save confirms them. */
  confirming: number
  /** Recorded here but not ticked. Left alone. */
  notTicked: number
}

export function summariseStockTake(
  location: string,
  selected: ReadonlySet<string>,
  tools: StockTakeTool[]
): StockTakeSummary {
  const summary: StockTakeSummary = { moving: 0, confirming: 0, notTicked: 0 }
  for (const tool of tools) {
    const here = tool.location === location
    if (selected.has(tool.id)) {
      if (here) summary.confirming++
      else summary.moving++
    } else if (here) {
      summary.notTicked++
    }
  }
  return summary
}

export type StockTakeOutcome = {
  toolId: string
  name: string
  result: "saved" | "held" | "failed"
  /** Why it was held or failed. */
  detail?: string
}

export type StockTakeState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; outcomes: StockTakeOutcome[] }
