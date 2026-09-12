"use client"

import { useTransition } from "react"

import { confirmPickupAction } from "@/app/(app)/dispatch/active/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

/**
 * Marks one physical tool collected from the site it's sitting on, inline on
 * the request detail page's tool list — the per-tool counterpart to
 * `PickupStopList`'s per-stop button on `/dispatch/active`. Same action either
 * way: `confirmPickupAction` moves just these ids to `In Transit` with the
 * request's driver.
 */
export function PickupToolButton({
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
  /** Shorter button, for the Dispatch board and Active trips cards. */
  compact?: boolean
}) {
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await confirmPickupAction({ requestId, toolIds: [toolId] })
      if (result.status === "picked-up") {
        toast.add({
          title: result.warning ? "Picked up, with a warning" : "Picked up",
          description: result.warning ?? `${toolName} collected from ${location}.`,
        })
      } else if (result.status === "error") {
        toast.add({ title: "Could not confirm pickup", description: result.message })
      }
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={cn("w-full", compact && "h-7 text-xs")}
      disabled={pending}
      // The Active trips card wraps each request in a `Link` — without this a
      // pickup would also navigate away from the screen it happened on.
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        confirm()
      }}
    >
      {pending ? <Spinner /> : "Picked up"}
    </Button>
  )
}
