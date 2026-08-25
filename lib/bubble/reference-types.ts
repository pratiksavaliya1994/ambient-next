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
  }
}

export type ToolType = {
  id: string
  name: string
  notes: string | null
  consumable: boolean
  relatedTo: ToDo[]
}

export type FieldPm = { id: string; name: string; company: string | null }

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
