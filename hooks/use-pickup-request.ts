"use client"

import { useState, useTransition, type FormEventHandler } from "react"
import { useRouter } from "next/navigation"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { INITIAL_CREATE_STATE, type CreateRequestState } from "@/app/(app)/requests/action-state"
import { createPickupRequestAction, fetchToolsForJobAction } from "@/app/(app)/requests/new/pickup/actions"
import {
  changedConditionLines,
  toolIdsOfPickup,
  toolLinesOfPickup,
  type PickupSelection,
} from "@/components/pickup-tool-picker"
import { toast } from "@/components/ui/toast"
import { useSiteStockHint, type SiteStockHint } from "@/hooks/use-site-stock-hint"
import type { PickupTool } from "@/lib/bubble/pickup-tools"
import type { Job } from "@/lib/bubble/reference-types"
import { pickupRequestFormSchema, type PickupRequestFormValues } from "@/lib/schemas/pickup-request"

/**
 * Everything the pickup form *does*, kept out of the components that draw it —
 * the same split `useCombinedRequest` makes, for the same reason: inlined, the
 * form ran to 560 lines.
 *
 * `job` and the tool selection live outside `react-hook-form` because their
 * widgets need more than the one schema field each maps onto; each `update*`
 * pushes the derived schema values in through `setValue`.
 */
export type PickupRequestController = {
  form: UseFormReturn<PickupRequestFormValues>
  state: CreateRequestState
  pending: boolean
  toolsPending: boolean
  job: Job | null
  updateJob: (next: Job | null) => void
  /** `tools._id` → the picked row, with its condition. */
  selected: Map<string, PickupSelection>
  updateSelected: (next: Map<string, PickupSelection>) => void
  /** The physical tools Bubble says are at the chosen job, fetched on job select. */
  toolsForJob: PickupTool[]
  loadToolsForJob: (target: Job) => Promise<PickupTool[]>
  /** What the job has been sent and not sent back — the materials picker's hint (5G). */
  siteHint: SiteStockHint
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function usePickupRequest(): PickupRequestController {
  const router = useRouter()
  const [state, setState] = useState<CreateRequestState>(INITIAL_CREATE_STATE)
  const [pending, startTransition] = useTransition()
  const [toolsPending, startToolsTransition] = useTransition()
  const site = useSiteStockHint()

  const form = useForm<PickupRequestFormValues>({
    resolver: zodResolver(pickupRequestFormSchema),
    // Nothing pre-picked — see `RequestForm`. `toDo`/`weAre` stay undefined.
    defaultValues: {
      jobId: "",
      gc: "",
      date: "",
      timeRange: "",
      floor: "",
      contact: "",
      contactPhone: "",
      fieldPm: "",
      notes: "",
      toolsNotes: "",
      materialLines: [],
      tentative: false,
      cleanup: false,
      tools: [],
      toolIds: [],
      toolConditionUpdates: [],
    },
  })
  const { setValue, setError, clearErrors, handleSubmit } = form

  const [job, setJob] = useState<Job | null>(null)
  const [selected, setSelected] = useState<Map<string, PickupSelection>>(new Map())
  const [toolsForJob, setToolsForJob] = useState<PickupTool[]>([])

  /**
   * Fetched on job select — and again from the Cleanup toggle only when that
   * load hasn't produced a list yet. Never cached across jobs, since which
   * tools are actually on site changes between visits (see
   * `lib/bubble/pickup-tools.ts`).
   */
  function loadToolsForJob(target: Job): Promise<PickupTool[]> {
    return new Promise((resolve) => {
      startToolsTransition(async () => {
        try {
          const fetched = await fetchToolsForJobAction(target.name)
          setToolsForJob(fetched)
          resolve(fetched)
        } catch (error) {
          toast.add({ title: "Couldn't load tools", description: error instanceof Error ? error.message : "Try again." })
          resolve([])
        }
      })
    })
  }

  function updateJob(next: Job | null) {
    setJob(next)
    // A new job means a different set of tools entirely — the previous job's
    // picks and fetched list can't carry over. Material lines are typed by
    // hand and stay; only their hint is the job's.
    setSelected(new Map())
    setValue("tools", [])
    setValue("toolIds", [])
    setValue("toolConditionUpdates", [])
    setValue("cleanup", false)
    setToolsForJob([])
    // Seeded from the job's own GC on every pick; the PM can overwrite it after.
    setValue("gc", next?.gc ?? "")
    // Only `jobId` is validated here. The "a tool or material" refine hangs off
    // `tools`, so validating it on job select would flag the empty picker
    // before anyone could fill it — the job is set last so this pass sees the
    // cleared tools in `isValid`.
    clearErrors("tools")
    setValue("jobId", next?.id ?? "", { shouldValidate: true })
    // The picker is inline, so there is no dialog-open moment to fetch on.
    if (next) void loadToolsForJob(next)
    site.load(next?.name ?? null)
  }

  function updateSelected(next: Map<string, PickupSelection>) {
    setSelected(next)
    // Three projections of one selection, set together so they can't drift:
    // names for the summary, ids for the `assignedtools` rows (3B), and the
    // condition diff. `tools` goes last: its validation pass is what refreshes
    // `isValid`, and the ids-match-names refine has to see the new `toolIds`
    // — validated first, a fresh pick left the submit disabled.
    setValue("toolIds", toolIdsOfPickup(next))
    setValue("toolConditionUpdates", changedConditionLines(next))
    setValue("tools", toolLinesOfPickup(next), { shouldValidate: true })
  }

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createPickupRequestAction(values)
      if (result.status === "invalid") {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          setError(key as keyof PickupRequestFormValues, { type: "server", message })
        }
      }
      setState(result)

      if (result.status === "created") {
        toast.add({ title: "Pickup request created", description: `${result.job} is on the board.` })
        router.push("/requests")
      }
    })
  })

  return {
    form,
    state,
    pending,
    toolsPending,
    job,
    updateJob,
    selected,
    updateSelected,
    toolsForJob,
    loadToolsForJob,
    siteHint: site.hint,
    onSubmit,
  }
}
