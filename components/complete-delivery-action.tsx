"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertCircleIcon, PackageCheckIcon } from "lucide-react"

import { offloadAction } from "@/app/(app)/requests/[requestId]/actions"
import { INITIAL_OFFLOAD_STATE, type OffloadState } from "@/app/(app)/requests/[requestId]/action-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import type { ToolRequest } from "@/lib/bubble/requests"

/**
 * The request detail page's "In Transit" action: a confirm dialog rather
 * than the dedicated `/offload` route this used to be, since the whole
 * screen there just repeated the detail page around one button
 * (`offloadAction` → `offloadRequest`, unchanged). Marks the request and
 * every assigned tool `Delivered`, and writes `location` to the job's name.
 *
 * `pendingPickupCount` (from `deriveTripStatus`) disables this rather than
 * letting the dialog open: a tool still sitting off-site hasn't actually
 * reached the driver yet, so there's nothing truthful to confirm. The tools
 * list alongside marks exactly which ones and offers each a "Picked up"
 * button. `offloadAction` itself re-checks the same thing server-side — this
 * is the UX half, not the only guard.
 *
 * `leftBehindCount` is the resolved half of the same idea: those stops were
 * answered, with "couldn't take it". They don't block, but the dialog must
 * stop claiming it delivers *every* tool — `offloadAction` writes only the
 * ones that were actually collected.
 */
export function CompleteDeliveryAction({
  request,
  toolCount,
  pendingPickupCount,
  leftBehindCount,
}: {
  request: ToolRequest
  toolCount: number
  pendingPickupCount: number
  /** Assigned tools the driver reached but couldn't collect — not delivered. */
  leftBehindCount: number
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<OffloadState>(INITIAL_OFFLOAD_STATE)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const deliverableCount = toolCount - leftBehindCount

  if (pendingPickupCount > 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" disabled>
          <PackageCheckIcon />
          Complete delivery
        </Button>
        <span className="text-xs text-status-attention-foreground">
          {pendingPickupCount} {pendingPickupCount === 1 ? "tool" : "tools"} still to pick up
        </span>
      </div>
    )
  }

  // Every tool was left behind, so there is no drop to record. `offloadAction`
  // refuses this too; here it's a reason rather than an error after the fact.
  if (toolCount > 0 && deliverableCount === 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" disabled>
          <PackageCheckIcon />
          Complete delivery
        </Button>
        <span className="text-xs text-status-attention-foreground">No tools were collected</span>
      </div>
    )
  }

  function confirm() {
    startTransition(async () => {
      const result = await offloadAction({ requestId: request.id })
      setState(result)

      if (result.status === "delivered") {
        toast.add({
          title: result.warning ? "Delivered with a warning" : "Delivered",
          description: result.warning ?? `${request.job} marked delivered.`,
        })
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (!next) setState(INITIAL_OFFLOAD_STATE)
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <PackageCheckIcon />
        Complete delivery
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete delivery?</DialogTitle>
          <DialogDescription>
            Marks this load Delivered, at <span className="font-medium">{request.job}</span> —{" "}
            {leftBehindCount > 0
              ? `${deliverableCount} of ${toolCount} tools, with ${leftBehindCount} left behind at ${leftBehindCount === 1 ? "its site" : "their sites"}.`
              : `${toolCount} ${toolCount === 1 ? "tool" : "tools"}.`}
          </DialogDescription>
        </DialogHeader>

        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Could not complete delivery</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={confirm}>
            {pending ? <Spinner /> : <PackageCheckIcon />}
            Complete delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
