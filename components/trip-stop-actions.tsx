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
import { dropOutcome, outstandingCollect, outstandingDrop, refusable, type StopWork } from "@/lib/bubble/trips-types"
import { stopButtonLabel, stopToastDescription } from "@/lib/trips/stop-labels"

/**
 * Recording one stop: everything gets done unless the driver says otherwise.
 *
 * **Both halves can fail, and they fail in opposite directions.** A collect the
 * driver couldn't take stays exactly where it is, flagged `Pickup Requested`. A
 * drop the site turned away stays in the van — nothing about the tool changes at
 * all — and rides on to a warehouse stop at the end of the run, which the run
 * sheet grows on its own.
 *
 * Unticking is therefore "it didn't happen", which is why each row's label
 * changes rather than there being two buttons per tool. A drop can only be
 * refused at a job site: `refusable` returns nothing at the yard, so the second
 * checklist simply isn't there on a warehouse stop, and the server enforces the
 * same rule rather than trusting that.
 */
export function TripStopActions({ tripId, work }: { tripId: string; work: StopWork }) {
  // Outstanding is side-specific: a collect is waiting while `Planned`, a drop
  // while it is on the truck. Both come from `trips-types`, next to
  // `isStopDone`, so the button and the Done tick read the same rows. They are
  // not the same question, though: a stop whose drop is still `Planned` has
  // nothing to record *yet* and is also not done, so this renders nothing and
  // the stop stays open until the tool has actually been collected upstream.
  const toCollect = outstandingCollect(work)
  const toDrop = outstandingDrop(work)
  const canRefuse = refusable(work)

  // The **exceptions**, not the checked set itself — a toolId lands here only
  // once the driver unticks it. Everything else defaults to checked, which
  // matters because this component doesn't remount between stops: it stays
  // mounted across every live, not-yet-done stop as `work` is refetched after
  // each action, and a tool can join `toDrop` only after it's actually been
  // collected upstream. A `useState` seeded from `toDrop` at first mount would
  // freeze out any tool that joined the list later; deriving off `toCollect`
  // and `toDrop` fresh each render instead means a newly-outstanding tool is
  // checked the moment it shows up, with no effect needed to resync it.
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [refused, setRefused] = useState<Set<string>>(() => new Set())
  const [state, setState] = useState<TripRunState>(INITIAL_TRIP_RUN_STATE)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  if (toCollect.length === 0 && toDrop.length === 0) return null

  const verb = dropOutcome(work.stop.kind).verb
  const taken = new Set(toCollect.filter((item) => !skipped.has(item.toolId)).map((item) => item.toolId))
  // `toDrop` can hold tools `canRefuse` doesn't (a warehouse stop refuses
  // nothing, or a tool already `Refused` upstream) — those never render a
  // checkbox, so they stay delivered untouched, same as before.
  const delivered = new Set(toDrop.filter((item) => !refused.has(item.toolId)).map((item) => item.toolId))
  const collectedItems = toCollect.filter((item) => taken.has(item.toolId))
  const deliveredItems = toDrop.filter((item) => delivered.has(item.toolId))
  const skippedItems = toCollect.filter((item) => skipped.has(item.toolId))
  const refusedItems = canRefuse.filter((item) => refused.has(item.toolId))

  function toggle(set: (update: (current: Set<string>) => Set<string>) => void, toolId: string, on: boolean) {
    set((current) => {
      const next = new Set(current)
      // "on" means checked (delivered/collected), so being ticked back on
      // clears the exception rather than recording one.
      if (on) next.delete(toolId)
      else next.add(toolId)
      return next
    })
  }

  function submit() {
    startTransition(async () => {
      const result = await completeStopAction({
        tripId,
        stopKey: work.stop.stopKey,
        dropToolIds: [...delivered],
        loadToolIds: [...taken],
        skipToolIds: skippedItems.map((item) => item.toolId),
        refuseToolIds: refusedItems.map((item) => item.toolId),
      })
      setState(result)

      if (result.status === "stop-done") {
        toast.add({ title: `${work.stop.location} done`, description: stopToastDescription(result, verb) })
        if (result.warning) toast.add({ title: "Check the requests", description: result.warning })
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      {toCollect.length > 0 && (
        <TripStopChecklist
          items={toCollect}
          checked={taken}
          onToggle={(toolId, on) => toggle(setSkipped, toolId, on)}
          disabled={pending}
          verb="Collected"
          flag={{ Icon: PackageXIcon, label: "Leaving behind" }}
        />
      )}

      {canRefuse.length > 0 && (
        <TripStopChecklist
          items={canRefuse}
          checked={delivered}
          onToggle={(toolId, on) => toggle(setRefused, toolId, on)}
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
        {stopButtonLabel({ collect: taken.size, drop: delivered.size }, verb)}
      </Button>

      <TripStopConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        collect={collectedItems}
        skip={skippedItems}
        drop={deliveredItems}
        refuse={refusedItems}
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
