import type { CandidateTool } from "@/lib/bubble/assigned-tools-types"

/**
 * Tool **sets**: a `toolstype` whose physical units are several *different*
 * tools sharing one number. "Full 880 Grinder Set" has no tool of its own — set
 * #9 is `880 Cart #9`, `880 Gang Box #9`, `880 Grinder #9` and `880 Vac #9`,
 * all linked to that one type.
 *
 * Which parts make a set is **data, not a guess**: `toolstype.setParts` (list
 * of text) names them, filled in Bubble's Data tab. A tool belongs to set #N
 * when its name *equals* `<part> #N` — equality, not "contains", because live
 * types also carry look-alikes (`Small 880 Cart #1` on the Full 880 type) that
 * must not join the set. Anything matching no part is listed as an ordinary
 * tool, and a type with no `setParts` is no set at all.
 *
 * Pure and client-safe: the assign dialog groups with it, and the server builds
 * each type's `SetShape` with it before the free-to-assign filter runs.
 */

const NUMBERED = /^(.*?)\s*#\s*(\d+)\s*$/

/** Case, edge and inner whitespace don't matter — `880  cart` is `880 Cart`. */
function normalise(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase()
}

/** `"880 Vac #09"` with `880 Vac` among `parts` → `{ part: "880 Vac", number: "9" }`; otherwise `null`. */
export function partOf(name: string, parts: readonly string[]): { part: string; number: string } | null {
  if (parts.length === 0) return null
  const match = NUMBERED.exec(name.trim())
  if (!match || !match[1]) return null
  const base = normalise(match[1])
  const part = parts.find((candidate) => normalise(candidate) === base)
  return part ? { part, number: String(Number(match[2])) } : null
}

/**
 * A type's set definition plus, per set number, which of its parts exist on
 * file — read off **every** tool of the type, whatever its status, so a busy
 * `880 Vac #9` reads as "not free" rather than "none on file".
 */
export type SetShape = { parts: string[]; onFile: Record<string, string[]> }

export const NO_SETS: SetShape = { parts: [], onFile: {} }

export function buildSetShape(names: readonly string[], parts: readonly string[]): SetShape {
  const onFile: Record<string, string[]> = {}
  for (const name of names) {
    const key = partOf(name, parts)
    if (!key) continue
    const have = (onFile[key.number] ??= [])
    if (!have.includes(key.part)) have.push(key.part)
  }
  return { parts: [...parts], onFile }
}

export type CandidateGroup =
  | { kind: "set"; number: string; tools: CandidateTool[] }
  | { kind: "single"; tool: CandidateTool }

/**
 * The dialog's rows: sets first, by number (#1, #2 … #10, not #1, #10, #2),
 * each set's parts in `setParts` order; then every tool that is no part, in the
 * order it came. Grouped over what the search left visible.
 */
export function groupCandidates(tools: readonly CandidateTool[], parts: readonly string[]): CandidateGroup[] {
  const byNumber = new Map<string, { tool: CandidateTool; rank: number }[]>()
  const loose: CandidateTool[] = []
  for (const tool of tools) {
    const key = partOf(tool.name, parts)
    if (!key) loose.push(tool)
    else byNumber.set(key.number, [...(byNumber.get(key.number) ?? []), { tool, rank: parts.indexOf(key.part) }])
  }

  return [
    ...[...byNumber]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([number, members]): CandidateGroup => ({
        kind: "set",
        number,
        tools: members.sort((a, b) => a.rank - b.rank).map((member) => member.tool),
      })),
    ...loose.map((tool): CandidateGroup => ({ kind: "single", tool })),
  ]
}

/**
 * Why a part isn't there: it could be added right now (`not added`), it exists
 * but is busy or out of service (`not free`), or set #N has no such tool at all
 * (`none on file`) — a data gap worth seeing, since the set definition says it
 * should.
 */
export type MissingReason = "not added" | "not free" | "none on file"
export type MissingPart = { name: string; reason: MissingReason }

/** The parts of set `number` that `present` doesn't cover. `candidates` is what's free to assign. */
export function missingParts(
  shape: SetShape,
  number: string,
  present: readonly CandidateTool[],
  candidates: readonly CandidateTool[]
): MissingPart[] {
  const covered = (tools: readonly CandidateTool[]) =>
    new Set(
      tools.flatMap((tool) => {
        const key = partOf(tool.name, shape.parts)
        return key && key.number === number ? [key.part] : []
      })
    )
  const have = covered(present)
  const free = covered(candidates)
  const onFile = new Set(shape.onFile[number] ?? [])

  return shape.parts
    .filter((part) => !have.has(part))
    .map((part): MissingPart => ({
      name: `${part} #${number}`,
      reason: free.has(part) ? "not added" : onFile.has(part) ? "not free" : "none on file",
    }))
}

/**
 * What a slot's picks are short of, counted **by part, not by set number**.
 * The loader is free to mix numbers — Grinder #1 is out, so Grinder #2 goes
 * with Cart, Gang Box and Vac #1 — and that is still one whole set on the
 * truck. So the target is the most of any one part picked (one Cart and one
 * Grinder → one set), and each part below it is short by the difference.
 *
 * `free` is how many more of that part could be added right now, so the
 * warning can say "pick one" apart from "there are none to pick".
 */
export type PartShortfall = { part: string; short: number; free: number }
export type SetShortfall = { sets: number; missing: PartShortfall[] }

export function setShortfall(
  chosen: readonly CandidateTool[],
  candidates: readonly CandidateTool[],
  shape: SetShape
): SetShortfall {
  const chosenIds = new Set(chosen.map((tool) => tool.id))
  const picked = new Map<string, number>()
  const free = new Map<string, number>()
  for (const tool of candidates) {
    const key = partOf(tool.name, shape.parts)
    if (!key) continue
    const tally = chosenIds.has(tool.id) ? picked : free
    tally.set(key.part, (tally.get(key.part) ?? 0) + 1)
  }
  // A chosen tool the candidates don't carry still counts toward its part.
  for (const tool of chosen) {
    const key = partOf(tool.name, shape.parts)
    if (key && !candidates.some((candidate) => candidate.id === tool.id))
      picked.set(key.part, (picked.get(key.part) ?? 0) + 1)
  }

  const sets = Math.max(0, ...picked.values())
  const missing = shape.parts
    .map((part) => ({ part, short: sets - (picked.get(part) ?? 0), free: free.get(part) ?? 0 }))
    .filter((entry) => entry.short > 0)
  return { sets, missing }
}
