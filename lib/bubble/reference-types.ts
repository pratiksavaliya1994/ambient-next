import { type ToDo } from "@/lib/bubble/enums"

/**
 * The shapes the reference lists come back as, plus the one pure function that
 * operates on them.
 *
 * Split out of `reference.ts` because that module is `server-only` — it holds
 * the API token path — while the request form needs both these types and
 * `toolTypesFor` in the browser. Nothing here touches Bubble.
 */

export type Job = {
  id: string
  name: string
  description: string
  gc: string | null
  borough: string | null
  /** `jobs.details` — the address/notes text `description` is built from. Read-only, for `/sites/[jobId]`. */
  details: string | null
  /** `jobs.location` — the full street address, distinct from `borough`. Read-only, for `/sites/[jobId]`. */
  location: string | null
  /** `jobs.ongoing` — whether the job is still active. Read-only, for `/sites/[jobId]`. */
  ongoing: boolean | null
}

/**
 * A job as the browser sees it — everything except `description`.
 *
 * All 1,445 jobs are handed to the combobox, and `description` is the longest
 * field on each by a wide margin. It is also server-only in practice: the sole
 * reader is `createToolRequest`, building `request.searchable`, which looks the
 * job up again by id. Shipping it doubled the page payload for nothing.
 */
// export type JobOption = Omit<Job, "description">

export function toJobOption(job: Job): Job {
  return {
    id: job.id,
    name: job.name,
    gc: job.gc,
    borough: job.borough,
    description: job.description,
    details: job.details,
    location: job.location,
    ongoing: job.ongoing,
  }
}

/**
 * A job as the trip builder's "Add stop" picker sees it. Lighter than
 * `toJobOption` on purpose: no `description`, the field that doubles the payload
 * across all 1,445 jobs, since a stop needs only the name to write.
 */
export type StopJob = Pick<Job, "id" | "name" | "gc" | "borough">

export function toStopJob(job: Job): StopJob {
  return { id: job.id, name: job.name, gc: job.gc, borough: job.borough }
}

export type ToolType = {
  id: string
  name: string
  notes: string | null
  consumable: boolean
  relatedTo: ToDo[]
}

export type FieldPm = { id: string; name: string; company: string | null }

/**
 * A Bubble `user` row — this app's own signed-in accounts, not `pms`. Offered
 * as a second driver-name convenience on the Dispatch board: per `CLAUDE.md`
 * the type carries no email or role, only `displayName` plus system fields, so
 * `displayName` is the only thing surfaced here.
 */
export type AppUser = { id: string; name: string }

/**
 * The `materials` table ("All Materials"): one default free-text material
 * list per job type it's offered for, mirroring `toolstype.realtedTo`. Only
 * 6 of the 8 `toDo` values have a row — "Fast Request" and "Simple Grind"
 * don't, unlike `toolTypesFor`, "Fast Request" has no "show everything"
 * fallback here, since concatenating all 6 lists into one text field
 * wouldn't be a sensible default.
 */
export type MaterialDefault = { id: string; list: string; relatedTo: ToDo[] }

/** The default material text for a job type, or `""` if none is on file. */
export function defaultMaterialsFor(all: MaterialDefault[], toDo: ToDo | null): string {
  const match = toDo && all.find((entry) => entry.relatedTo.includes(toDo))
  return match?.list ?? ""
}

export type TimeSlot = {
  id: string
  label: string
  order: number
  hour: number
}

/**
 * The tools offered for a job type. "Fast Request" is not a job type any tool
 * declares, so it falls through to the whole catalogue.
 */
export function toolTypesFor(all: ToolType[], toDo: ToDo | null): ToolType[] {
  if (!toDo || toDo === "Fast Request") return all
  return all.filter((type) => type.relatedTo.includes(toDo))
}
