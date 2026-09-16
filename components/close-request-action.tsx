"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArchiveIcon } from "lucide-react"

import { closeRequestAction } from "@/app/(app)/requests/[requestId]/actions"
import { INITIAL_CLOSE_REQUEST_STATE, type CloseRequestState } from "@/app/(app)/requests/[requestId]/action-state"
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
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

/**
 * "This request is finished, even though not everything was sent."
 *
 * A request closes itself only when every assigned tool has landed *and* every
 * requested quantity was filled. This is the way out for the case that leaves:
 * four grinders asked for, three sent, and the job is done with them. Without
 * it such a request sits at `Partially Delivered` forever.
 *
 * Behind a confirmation because it is one-way — the status derivation is a
 * ratchet, so a closed request does not reopen when tools are assigned to it
 * later. Same reasoning the leave-behind dialog used: no undo, so ask first.
 */
export function CloseRequestAction({
  requestId,
  outstanding,
  terminalLabel,
}: {
  requestId: string
  /** Requested units never sent — what makes this button meaningful rather than noise. */
  outstanding: number
  /** `Delivered` for a delivery, `Returned` for a pickup. */
  terminalLabel: string
}) {
  const router = useRouter()
  const [state, setState] = useState<CloseRequestState>(INITIAL_CLOSE_REQUEST_STATE)
  const [pending, startTransition] = useTransition()

  function close() {
    startTransition(async () => {
      const result = await closeRequestAction({ requestId })
      setState(result)

      if (result.status === "closed") {
        toast.add({ title: `Request ${result.requestStatus.toLowerCase()}`, description: "Nothing further is expected." })
        router.refresh()
      }
    })
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <ArchiveIcon />
            Close request
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close this request?</DialogTitle>
          <DialogDescription>
            {outstanding > 0
              ? `${outstanding} requested ${outstanding === 1 ? "tool was" : "tools were"} never sent. Closing marks the request ${terminalLabel} anyway — use this when nobody is going to send the rest.`
              : `This marks the request ${terminalLabel}.`}
          </DialogDescription>
        </DialogHeader>

        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <p className="text-sm text-muted-foreground">
          This can&rsquo;t be undone from here — a closed request stays closed even if tools are assigned to it later.
        </p>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Keep it open</Button>} />
          <Button onClick={close} disabled={pending}>
            {pending ? <Spinner /> : <ArchiveIcon />}
            Close request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
