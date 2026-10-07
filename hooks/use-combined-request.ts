"use client"

import { useState, useTransition, type FormEventHandler } from "react"
import { useRouter } from "next/navigation"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { INITIAL_COMBINED_STATE, type CombinedRequestState } from "@/app/(app)/requests/new/combined/action-state"
import { createCombinedRequestAction } from "@/app/(app)/requests/new/combined/actions"
import { fetchToolsForJobAction } from "@/app/(app)/requests/new/pickup/actions"
import { toolLinesOf } from "@/components/tool-picker"
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
import { combinedRequestFormSchema, type CombinedRequestFormValues } from "@/lib/schemas/combined-request"

/**
 * Everything the combined form *does*, kept out of the components that draw
 * it — the page carries two tool pickers of different kinds plus the shared
 * fields, and inlining this would put the whole thing well past the component
 * size rules in `CLAUDE.md`.
 *
 * The shape mirrors the two single-purpose forms deliberately: `job` and both
 * selections live outside `react-hook-form` for the same reason they do there
 * (their widgets need more than the one schema field each maps onto), and each
 * `update*` pushes the derived schema values in through `setValue`.
 */
export type CombinedRequestController = {
  form: UseFormReturn<CombinedRequestFormValues>
  state: CombinedRequestState
  pending: boolean
  toolsPending: boolean
  job: Job | null
  updateJob: (next: Job | null) => void
  /** Delivery: `toolstype` name → quantity. */
  deliverySelected: Record<string, number>
  updateDeliverySelected: (next: Record<string, number>) => void
  /** Pickup: `tools._id` → the picked row, with its condition. */
  pickupSelected: Map<string, PickupSelection>
  updatePickupSelected: (next: Map<string, PickupSelection>) => void
  /** The physical tools Bubble says are at the chosen job, fetched on job select. */
  toolsForJob: PickupTool[]
  loadToolsForJob: (target: Job) => Promise<PickupTool[]>
  /** What the job has been sent and not sent back — the pickup half's materials hint (5G). */
  siteHint: SiteStockHint
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function useCombinedRequest(): CombinedRequestController {
  const router = useRouter()
  const [state, setState] = useState<CombinedRequestState>(INITIAL_COMBINED_STATE)
  const [pending, startTransition] = useTransition()
  const [toolsPending, startToolsTransition] = useTransition()
  const site = useSiteStockHint()

  const form = useForm<CombinedRequestFormValues>({
    resolver: zodResolver(combinedRequestFormSchema),
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
      tentative: false,
      cleanup: false,
      deliveryTools: [],
      deliveryToolsNotes: "",
      deliveryMaterialLines: [],
      pickupTools: [],
      pickupToolIds: [],
      pickupToolConditionUpdates: [],
      pickupToolsNotes: "",
      pickupMaterialLines: [],
    },
  })
  const { setValue, clearErrors, setError, handleSubmit } = form

  const [job, setJob] = useState<Job | null>(null)
  const [deliverySelected, setDeliverySelected] = useState<Record<string, number>>({})
  const [pickupSelected, setPickupSelected] = useState<Map<string, PickupSelection>>(new Map())
  const [toolsForJob, setToolsForJob] = useState<PickupTool[]>([])

  /**
   * Fetched on job select, never cached across jobs — which units are actually
   * on site changes between visits (see `lib/bubble/pickup-tools.ts`).
   */
  function loadToolsForJob(target: Job): Promise<PickupTool[]> {
    return new Promise((resolve) => {
      startToolsTransition(async () => {
        try {
          const fetched = await fetchToolsForJobAction(target.name)
          setToolsForJob(fetched)
          resolve(fetched)
        } catch (error) {
          toast.add({
            title: "Couldn't load tools",
            description: error instanceof Error ? error.message : "Try again.",
          })
          resolve([])
        }
      })
    })
  }

  function updateJob(next: Job | null) {
    setJob(next)
    // Only the *pickup* side is job-specific: its list is the physical tools at
    // that job, so a new job invalidates both the list and every pick made from
    // it. The delivery side picks from the catalogue and is left alone.
    setPickupSelected(new Map())
    setValue("pickupTools", [])
    setValue("pickupToolIds", [])
    setValue("pickupToolConditionUpdates", [])
    setValue("cleanup", false)
    setToolsForJob([])
    // Seeded from the job's own GC on every pick; the PM can overwrite it after.
    setValue("gc", next?.gc ?? "")
    // Same ordering trick as the pickup form: clear the tools error and set
    // `jobId` last, so this validation pass sees the cleared picks rather than
    // flagging an empty picker the user hasn't had a chance to fill.
    clearErrors("pickupTools")
    setValue("jobId", next?.id ?? "", { shouldValidate: true })
    if (next) void loadToolsForJob(next)
    site.load(next?.name ?? null)
  }

  function updateDeliverySelected(next: Record<string, number>) {
    setDeliverySelected(next)
    setValue("deliveryTools", toolLinesOf(next), { shouldValidate: true })
  }

  function updatePickupSelected(next: Map<string, PickupSelection>) {
    setPickupSelected(next)
    // Three projections of one selection, set together so they can't drift:
    // names for the summary, ids for the `assignedtools` rows, the condition diff.
    // `pickupTools` goes last so its validation pass sees the new ids — see
    // `usePickupRequest.updateSelected`.
    setValue("pickupToolIds", toolIdsOfPickup(next))
    setValue("pickupToolConditionUpdates", changedConditionLines(next))
    setValue("pickupTools", toolLinesOfPickup(next), { shouldValidate: true })
  }

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createCombinedRequestAction(values)
      if (result.status === "invalid") {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          setError(key as keyof CombinedRequestFormValues, { type: "server", message })
        }
      }
      setState(result)

      if (result.status === "created") {
        toast.add({
          title: "Both requests created",
          description: `${result.job} has a pickup and a delivery on the board.`,
        })
        router.push("/requests")
      }

      // `partial` deliberately does **not** navigate: one half still has to be
      // retried, and the values to retry it with are the ones in this form.
      if (result.status === "partial") {
        toast.add({
          title: "Only one request was created",
          description: result.message,
        })
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
    deliverySelected,
    updateDeliverySelected,
    pickupSelected,
    updatePickupSelected,
    toolsForJob,
    loadToolsForJob,
    siteHint: site.hint,
    onSubmit,
  }
}
