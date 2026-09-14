"use client"

import { useState, useTransition } from "react"
import { PackageXIcon } from "lucide-react"

import { leaveBehindAction } from "@/app/(app)/dispatch/active/actions"
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
import { cn } from "@/lib/utils"

/**
 * The counterpart to `PickupToolButton`: the driver reached the stop and
 * couldn't take this tool. It stays where it is, flagged `Pickup Requested`,
 * and stops blocking the request's own delivery — see `leaveBehindAction`.
 *
 * Behind a confirmation dialog rather than a bare click, unlike the pickup
 * confirm beside it: there is no undo, and the two buttons sit next to each
 * other on a row a driver taps one-handed.
 */
export function LeaveBehindButton({
  requestId,
  toolId,
  toolName,
  location,
  compact = false,
}: {
  requestId: string
  toolId: string
  toolName: string
  location: string
  /** Shorter button, for the Active trips cards. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await leaveBehindAction({ requestId, toolIds: [toolId] })
      if (result.status === "left-behind") {
        toast.add({
          title: result.warning ? "Left behind, with a warning" : "Left behind",
          description: result.warning ?? `${toolName} stays at ${location}. This delivery can go without it.`,
        })
        setOpen(false)
      } else if (result.status === "error") {
        toast.add({ title: "Could not leave this tool behind", description: result.message })
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
      }}
    >
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            className={cn("w-full", compact && "h-7 text-xs")}
            // The Active trips card wraps each request in a `Link` — without
            // this, opening the dialog would also navigate away from it.
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          />
        }
      >
        Not picked up
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave {toolName} behind?</DialogTitle>
          <DialogDescription>
            It stays at <span className="font-medium">{location}</span>, flagged as still wanted, and this delivery
            completes without it. This can&apos;t be undone from the app.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? <Spinner /> : <PackageXIcon />}
            Leave behind
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
