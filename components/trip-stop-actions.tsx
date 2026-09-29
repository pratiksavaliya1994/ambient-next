"use client"

import { useState, useTransition } from "react"
import { CheckIcon, PackageXIcon, UndoIcon } from "lucide-react"

import { completeStopAction } from "@/app/(app)/trips/[tripId]/actions"
import { INITIAL_TRIP_RUN_STATE, type TripRunState } from "@/app/(app)/trips/action-state"
import { TripStopChecklist } from "@/components/trip-stop-checklist"
import { TripStopConfirmDialog } from "@/components/trip-stop-confirm-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { dropOutcome, type StopWork } from "@/lib/bubble/trips-types"
import { stopChecklist } from "@/lib/trips/stop-checklist"
import { stopButtonLabel, stopToastDescription } from "@/lib/trips/stop-labels"

/**
 * Recording one stop: everything gets done unless the driver says otherwise.
 *
 * **Both halves can fail, and they fail in opposite directions.** A collect the
 * driver couldn't take stays exactly where it is, flagged `Pickup Requested`. A
 * drop the site turned away stays in the van — nothing about the tool changes at
 * all — and rides on to a warehouse stop at the end of the run, which the run
 * sheet grows on its own. Material lines follow the same two rules, tick-only.
 *
 * Unticking is therefore "it didn't happen", which is why each row's label
 * changes rather than there being two buttons per tool. A drop can only be
 * refused at a job site: `refusable` returns nothing at the yard, so the second
 * checklist simply isn't there on a warehouse stop, and the server enforces the
 * same rule rather than trusting that. The splitting lives in `stopChecklist`.
 */
export function TripStopActions({ tripId, work }: { tripId: string; work: StopWork }) {
  // The **exceptions**, not the checked set itself — an id lands here only once
  // the driver unticks it. Everything else defaults to checked, which matters
  // because this component doesn't remount between stops: it stays mounted
  // across every live, not-yet-done stop as `work` is refetched after each
  // action, and a row can join the drops only after it's actually been
  // collected upstream. Deriving the lists fresh each render means a
  // newly-outstanding row is checked the moment it shows up, with no effect
  // needed to resync it.
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set())
  const [state, setState] = useState<TripRunState>(INITIAL_TRIP_RUN_STATE)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  // Outstanding is side-specific: a collect is waiting while `Planned`, a drop
  // while it is on the truck. A stop whose drop is still `Planned` has nothing
  // to record *yet* and is also not done, so this renders nothing and the stop
  // stays open until the row has actually been collected upstream.
  const checklist = stopChecklist(work, unticked)
  if (checklist.idle) return null

  const verb = dropOutcome(work.stop.kind).verb
  const checked = new Set(
    [...checklist.collectable, ...checklist.refusable].map((row) => row.id).filter((id) => !unticked.has(id))
  )

  function toggle(id: string, on: boolean) {
    setUnticked((current) => {
      const next = new Set(current)
      // "on" means checked (delivered/collected), so being ticked back on
      // clears the exception rather than recording one.
      if (on) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit() {
    startTransition(async () => {
      const result = await completeStopAction({ tripId, stopKey: work.stop.stopKey, ...checklist.input })
      setState(result)

      if (result.status === "stop-done") {
        toast.add({ title: `${work.stop.location} done`, description: stopToastDescription(result, verb) })
        if (result.warning) toast.add({ title: "Check the requests", description: result.warning })
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      {checklist.collectable.length > 0 && (
        <TripStopChecklist
          items={checklist.collectable}
          checked={checked}
          onToggle={toggle}
          disabled={pending}
          verb="Collected"
          flag={{ Icon: PackageXIcon, label: "Leaving behind" }}
        />
      )}

      {checklist.refusable.length > 0 && (
        <TripStopChecklist
          items={checklist.refusable}
          checked={checked}
          onToggle={toggle}
          disabled={pending}
          verb="Delivered"
          flag={{ Icon: UndoIcon, label: "Site refused — back to the warehouse" }}
        />
      )}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <Button size="sm" onClick={() => setConfirming(true)} disabled={pending}>
        {pending ? <Spinner /> : <CheckIcon />}
        {stopButtonLabel(checklist.counts, verb)}
      </Button>

      <TripStopConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        {...checklist.summary}
        verb={verb}
        pending={pending}
        onConfirm={() => {
          setConfirming(false)
          submit()
        }}
      />
    </div>
  )
}
