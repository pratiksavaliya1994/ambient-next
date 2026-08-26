import "server-only"

import { z } from "zod"

import { bubbleListAll } from "@/lib/bubble/client"
import { TO_DO, type ToDo } from "@/lib/bubble/enums"
import type { FieldPm, Job, MaterialDefault, TimeSlot, ToolType } from "@/lib/bubble/reference-types"

export type { FieldPm, Job, MaterialDefault, TimeSlot, ToolType }
export { defaultMaterialsFor, toolTypesFor } from "@/lib/bubble/reference-types"

/**
 * The four read-only lookup lists the request form needs: jobs, tool types,
 * field PMs and calendar time slots.
 *
 * They live together because they share one property that shapes the code:
 * they are large, they barely change, and every page needs them. `jobs` alone
 * is ~1,450 rows, which is fifteen round trips at Bubble's 100-row page cap —
 * far too slow to repeat on each render — so each loader is memoised in
 * process for a few minutes. That is deliberately a prototype-grade cache: it
 * is per-instance and lost on restart, which is fine while this runs as one
 * Next.js process, and would want replacing with `use cache` if it ever scales
 * out.
 */

const TTL_MS = 5 * 60 * 1000

type Entry<T> = { at: number; value: Promise<T> }
const memo = new Map<string, Entry<unknown>>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key) as Entry<T> | undefined
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  const value = load().catch((error) => {
    // A failed load must not be cached, or one blip poisons the next 5 minutes.
    memo.delete(key)
    throw error
  })
  memo.set(key, { at: Date.now(), value })
  return value
}

// ---------------------------------------------------------------- jobs

/**
 * `request.job` stores the job *name* as text, not a link, so `name` is what
 * gets written. `description` is the longer "name + details" string that the
 * Bubble UI concatenates into `request.searchable`.
 */
const jobRow = z.looseObject({
  _id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  details: z.string().optional(),
  gc: z.string().optional(),
  borough: z.string().optional(),
  status: z.string().optional(),
})

export function listJobs(): Promise<Job[]> {
  return cached("jobs", async () => {
    const rows = await bubbleListAll("jobs")
    return rows
      .map((row) => jobRow.parse(row))
      .filter((row) => row.name)
      .map((row) => ({
        id: row._id,
        name: row.name!,
        description: row.description ?? row.name!,
        gc: row.gc ?? null,
        borough: row.borough ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })
}

// ---------------------------------------------------------- tool types

/**
 * `realtedTo` — the misspelling is Bubble's and must be kept — lists the job
 * types a tool is offered for. An empty list means the tool is not tied to any
 * job type; those only show under "Fast Request".
 */
const toolTypeRow = z.looseObject({
  _id: z.string(),
  name: z.string().optional(),
  notes: z.string().optional(),
  consumable: z.boolean().optional(),
  order: z.number().optional(),
  realtedTo: z.array(z.string()).optional(),
})

const IS_TO_DO = new Set<string>(TO_DO)

export function listToolTypes(): Promise<ToolType[]> {
  return cached("toolstype", async () => {
    const rows = await bubbleListAll("toolstype")
    return rows
      .map((row) => toolTypeRow.parse(row))
      .filter((row) => row.name)
      .map((row) => ({
        id: row._id,
        name: row.name!.trim(),
        notes: row.notes ?? null,
        consumable: row.consumable ?? false,
        relatedTo: (row.realtedTo ?? []).filter((value): value is ToDo => IS_TO_DO.has(value)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })
}

// ----------------------------------------------------- material defaults

/**
 * The `materials` table: `List` is the default free-text material list,
 * `realtedTo` which job types it's the default for — same misspelling, same
 * shape as `toolstype.realtedTo`.
 */
const materialRow = z.looseObject({
  _id: z.string(),
  List: z.string().optional(),
  realtedTo: z.array(z.string()).optional(),
})

export function listMaterialDefaults(): Promise<MaterialDefault[]> {
  return cached("materials", async () => {
    const rows = await bubbleListAll("materials")
    return rows
      .map((row) => materialRow.parse(row))
      .map((row) => ({
        id: row._id,
        list: row.List ?? "",
        relatedTo: (row.realtedTo ?? []).filter((value): value is ToDo => IS_TO_DO.has(value)),
      }))
  })
}

// ----------------------------------------------------------------- pms

/**
 * `request.fieldPM` is an option set and `fieldPM2` is a text copy of the same
 * name. Every live row written in the last two years fills `fieldPM2` and
 * leaves `fieldPM` empty, so this app writes the text field only — an option
 * set write with an unrecognised value fails silently in Bubble.
 */
const pmRow = z.looseObject({
  _id: z.string(),
  Name: z.string().optional(),
  Company: z.string().optional(),
  Active: z.boolean().optional(),
})

export function listFieldPms(): Promise<FieldPm[]> {
  return cached("pms", async () => {
    const rows = await bubbleListAll("pms")
    return rows
      .map((row) => pmRow.parse(row))
      .filter((row) => row.Name)
      .map((row) => ({
        id: row._id,
        name: row.Name!,
        company: row.Company ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })
}

// ---------------------------------------------------------- time slots

/**
 * The 14 half-hour slots the Bubble calendar lays requests out on. They are
 * what set `requestDateStart` / `requestDateEnd`; the free-text `timeRange`
 * field is a separate human note ("Anytime", "6-8am") and is not derived from
 * these.
 */
const timeLabelRow = z.looseObject({
  _id: z.string(),
  label: z.string().optional(),
  order: z.number().optional(),
})

/** `06:00 a.m. to 06:30 a.m.` → 6; `01:00 p.m. to 01:30 p.m.` → 13. */
function startHourOf(label: string): number | null {
  const match = label.match(/^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i)
  if (!match) return null

  const hour = Number(match[1]) % 12
  return match[3].toLowerCase() === "p" ? hour + 12 : hour
}

export function listTimeSlots(): Promise<TimeSlot[]> {
  return cached("timelabels", async () => {
    const rows = await bubbleListAll("timelabels")
    return rows
      .map((row) => timeLabelRow.parse(row))
      .flatMap((row) => {
        const hour = row.label ? startHourOf(row.label) : null
        if (!row.label || hour === null) return []
        return [{ id: row._id, label: row.label, order: row.order ?? 0, hour }]
      })
      .sort((a, b) => a.order - b.order)
  })
}
