"use client"

import { AlertCircleIcon } from "lucide-react"

import { PickupRequestDetails } from "@/components/pickup-request-details"
import { PickupRequestItemsCard } from "@/components/pickup-request-items-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { usePickupRequest } from "@/hooks/use-pickup-request"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import type { FieldPm, Job } from "@/lib/bubble/reference-types"

/**
 * The Pickup counterpart to `RequestForm` — same two-column shell, three real
 * differences: a single date instead of a range, individual physical tools
 * (checkbox, always quantity 1, fetched live per job from Bubble's `tools`
 * table) instead of the `toolstype` catalogue, and a "Cleanup the Site"
 * toggle that auto-selects (but doesn't lock) all of a job's tools.
 *
 * Materials are structured lines to collect (5G), entered by hand as
 * estimates. The state and handlers live in `usePickupRequest`.
 */
export function PickupRequestForm({
  jobs,
  fieldPms,
  materialItems,
}: {
  jobs: Job[]
  fieldPms: FieldPm[]
  materialItems: MaterialItem[]
}) {
  const controller = usePickupRequest()
  const { state } = controller

  return (
    <form onSubmit={controller.onSubmit} className="flex flex-col gap-4">
      {(state.status === "error" || state.status === "invalid") && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not create the request</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <PickupRequestDetails controller={controller} jobs={jobs} fieldPms={fieldPms} />
        <PickupRequestItemsCard controller={controller} materialItems={materialItems} />
      </div>
    </form>
  )
}
