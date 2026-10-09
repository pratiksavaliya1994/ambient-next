"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BanIcon } from "lucide-react"

import { cancelRequestAction } from "@/app/(app)/requests/[requestId]/cancel-action"
import { INITIAL_CANCEL_REQUEST_STATE, type CancelRequestState } from "@/app/(app)/requests/[requestId]/action-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { CANCEL_REASON_MAX } from "@/lib/schemas/trip"

/**
 * "This request should never have existed" — stale, or made by mistake.
 *
 * Only rendered while nothing has gone out and no trip holds any of it (see
 * `cancelBlockReason`); the action re-checks both. Behind a confirmation
 * because it is one-way: a cancelled request never reopens.
 */
export function CancelRequestAction({ requestId, pickup }: { requestId: string; pickup: boolean }) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [state, setState] = useState<CancelRequestState>(INITIAL_CANCEL_REQUEST_STATE)
  const [pending, startTransition] = useTransition()

  function cancel() {
    startTransition(async () => {
      const result = await cancelRequestAction({ requestId, reason })
      setState(result)

      if (result.status === "cancelled") {
        toast.add({ title: "Request cancelled", description: result.warning ?? "Its tools and materials were released." })
        router.refresh()
      }
    })
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="text-destructive">
            <BanIcon />
            Cancel request
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this request?</DialogTitle>
          <DialogDescription>
            {pickup
              ? "Its tools stop being flagged for pickup, and its materials stop heading anywhere."
              : "Its assigned tools are freed and any stock set aside for it goes back on the shelf."}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cancel-reason">Reason (optional)</FieldLabel>
            <Textarea
              id="cancel-reason"
              value={reason}
              maxLength={CANCEL_REASON_MAX}
              placeholder="Created by mistake, job postponed…"
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>Saved in the request&rsquo;s notes with your name and the time.</FieldDescription>
          </Field>
        </FieldGroup>

        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Keep it</Button>} />
          <Button variant="destructive" onClick={cancel} disabled={pending}>
            {pending ? <Spinner /> : <BanIcon />}
            Cancel request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
