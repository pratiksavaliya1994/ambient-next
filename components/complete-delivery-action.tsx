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
 */
export function CompleteDeliveryAction({ request, toolCount }: { request: ToolRequest; toolCount: number }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<OffloadState>(INITIAL_OFFLOAD_STATE)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

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
            Marks every tool on this load Delivered, at <span className="font-medium">{request.job}</span> —{" "}
            {toolCount} {toolCount === 1 ? "tool" : "tools"}.
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
