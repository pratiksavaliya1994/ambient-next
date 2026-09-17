"use client"

import type { ReactElement, ReactNode } from "react"

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

/**
 * Confirm-before-you-commit wrapper shared by the trip run sheet's
 * Start/Finish/Cancel buttons — all three act on the live trip with no undo,
 * so a stray tap on the run sheet shouldn't be enough to fire one.
 */
export function TripActionConfirm({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  confirmIcon,
  pending,
  disabled,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  title: string
  description: ReactNode
  confirmLabel: string
  confirmIcon: ReactNode
  pending: boolean
  disabled?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Go back
          </Button>
          <Button disabled={pending || disabled} onClick={onConfirm}>
            {pending ? <Spinner /> : confirmIcon}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
