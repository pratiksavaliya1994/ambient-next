"use client"

import { AlertCircleIcon, SendIcon } from "lucide-react"

import type { CombinedRequestState } from "@/app/(app)/requests/new/combined/action-state"
import { CombinedDeliveryCard } from "@/components/combined-delivery-card"
import { CombinedPickupCard } from "@/components/combined-pickup-card"
import { CombinedRequestDetails } from "@/components/combined-request-details"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useCombinedRequest } from "@/hooks/use-combined-request"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import type { FieldPm, Job, MaterialDefault, TimeSlot, ToolType } from "@/lib/bubble/reference-types"

/**
 * Delivery + Pickup in one pass. A **utility page**, not a third kind of
 * request: on submit it makes the same two workflow calls the two
 * single-purpose pages make, and Bubble ends up with two ordinary, independent
 * `request` rows. See `createCombinedRequestAction` for what that costs (two
 * WhatsApp messages, no transaction) and why it is the right trade.
 *
 * Layout mirrors the other two — shared fields in the left column, the two
 * tool columns stacked on the right, everything stacking below `lg`. The state
 * and handlers live in `useCombinedRequest`.
 */
export function CombinedRequestForm({
  jobs,
  toolTypes,
  fieldPms,
  timeSlots,
  materialDefaults,
  materialItems,
}: {
  jobs: Job[]
  toolTypes: ToolType[]
  fieldPms: FieldPm[]
  timeSlots: TimeSlot[]
  /** The pickup half's free-text starting points — until 5G gives it lines too. */
  materialDefaults: MaterialDefault[]
  /** The delivery half's material catalogue, read fresh. */
  materialItems: MaterialItem[]
}) {
  const combined = useCombinedRequest(timeSlots, fieldPms)
  const { form } = combined
  const { isValid } = form.formState

  return (
    <form onSubmit={combined.onSubmit} className="flex flex-col gap-4">
      <CombinedStateAlert state={combined.state} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <CombinedRequestDetails
          form={form}
          jobs={jobs}
          job={combined.job}
          onJobChange={combined.updateJob}
          fieldPms={fieldPms}
          timeSlots={timeSlots}
        />

        <div className="flex flex-col gap-4">
          <CombinedPickupCard
            form={form}
            job={combined.job}
            tools={combined.toolsForJob}
            loading={combined.toolsPending}
            selected={combined.pickupSelected}
            onChange={combined.updatePickupSelected}
            onLoadTools={combined.loadToolsForJob}
            materialDefaults={materialDefaults}
          />

          <CombinedDeliveryCard
            form={form}
            toolTypes={toolTypes}
            materialItems={materialItems}
            selected={combined.deliverySelected}
            onChange={combined.updateDeliverySelected}
          />

          <Button type="submit" disabled={!isValid || combined.pending}>
            {combined.pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
            Create both requests
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Creates two separate requests — one pickup and one delivery.
          </p>
        </div>
      </div>
    </form>
  )
}

/**
 * `partial` gets its own wording rather than being folded into the error case:
 * one request really was created, and telling someone their submit failed when
 * a row exists is how a job ends up with two of the same pickup.
 */
function CombinedStateAlert({ state }: { state: CombinedRequestState }) {
  if (state.status === "partial") {
    return (
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>Only the {state.created} request was created</AlertTitle>
        <AlertDescription>
          {state.message} The {state.created} request for {state.job} already exists — don&apos;t submit this form
          again. Create the missing half on its own page instead.
        </AlertDescription>
      </Alert>
    )
  }

  if (state.status === "error" || state.status === "invalid") {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Could not create the requests</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    )
  }

  return null
}
