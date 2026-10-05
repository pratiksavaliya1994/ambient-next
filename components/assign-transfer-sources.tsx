"use client"

import { useTransition } from "react"
import { ArrowRightLeftIcon, CheckIcon, XIcon } from "lucide-react"

import { linkTransferAction, unlinkTransferAction } from "@/app/(app)/requests/[requestId]/assign/transfer-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import type { TransferSource } from "@/lib/bubble/material-transfer-types"

/**
 * "Pickups at other sites" under one inventory delivery line (5G §2a): open
 * pickup lines for the same item elsewhere. Each offers **Transfer to this
 * site** — collect it there and drop it here instead of at the warehouse —
 * and, once chosen, reads "Coming here" with a separate **Cancel transfer**.
 *
 * Only what the line still needs is transferred: a pickup estimated above that
 * is split, and its rest still goes to the warehouse — the button says so
 * before it's pressed. Nothing is offered once the line is covered.
 *
 * Each button writes **immediately** and toasts, rather than waiting for the
 * card's Save: a link is its own write with its own guards. A refusal is
 * shown as the action words it. The action revalidates the page, so the
 * line's coverage and stepper bound follow.
 *
 * Renders nothing when there are no sources.
 */
export function AssignTransferSources({
  deliveryLineId,
  need,
  sources,
}: {
  deliveryLineId: string
  /** Requested less assigned from stock and already coming from transfers — as saved. */
  need: number
  /** Already narrowed to this line's item and to sources unlinked or linked here. */
  sources: readonly TransferSource[]
}) {
  if (sources.length === 0) return null

  return (
    <div className="ml-3 flex flex-col gap-1 border-l-2 border-dashed border-material/40 py-1 pl-3">
      <span className="flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <ArrowRightLeftIcon className="size-3" />
        Pickups at other sites — send here instead of the warehouse
      </span>
      <ul className="flex flex-col gap-1">
        {sources.map((source) => (
          <TransferSourceRow key={source.pickupLineId} deliveryLineId={deliveryLineId} need={need} source={source} />
        ))}
      </ul>
    </div>
  )
}

function TransferSourceRow({
  deliveryLineId,
  need,
  source,
}: {
  deliveryLineId: string
  need: number
  source: TransferSource
}) {
  const [pending, startTransition] = useTransition()
  const linked = source.linkedToLineId === deliveryLineId
  const unit = source.unit ? ` ${source.unit}` : ""
  const take = Math.min(need, source.estimate)

  function toggle() {
    startTransition(async () => {
      const result = linked
        ? await unlinkTransferAction({ pickupLineId: source.pickupLineId })
        : await linkTransferAction({ deliveryLineId, pickupLineId: source.pickupLineId })
      if (result.status === "error") {
        toast.add({
          title: linked ? "Couldn't cancel the transfer" : "Couldn't set up the transfer",
          description: result.message,
        })
        return
      }
      const rest =
        result.status === "linked" && result.splitOff
          ? ` The other ~${result.splitOff}${unit} still goes to the warehouse.`
          : ""
      toast.add({
        title: result.status === "linked" ? `Transferring from ${source.job}` : `Transfer from ${source.job} cancelled`,
        description:
          result.warning ??
          (result.status === "linked"
            ? `About ${source.estimate - (result.splitOff ?? 0)}${unit} will come from there instead of stock.${rest}`
            : "That pickup goes back to the warehouse."),
      })
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md bg-material/5 px-2 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate font-medium" title={source.job}>
        {source.job}
      </span>
      <span className="text-muted-foreground tabular-nums">
        about {source.estimate}
        {unit}
        {source.start && ` · pickup ${newYorkDayLabel(source.start)}`}
      </span>
      {linked ? (
        <>
          <Badge className="border-transparent bg-status-ok/15 text-status-ok-foreground">
            <CheckIcon />
            Coming here from this pickup
          </Badge>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={toggle}>
            {pending ? <Spinner /> : <XIcon />}
            Cancel transfer
          </Button>
        </>
      ) : take <= 0 ? (
        <span className="text-muted-foreground">Not needed — this line is covered</span>
      ) : (
        <>
          {take < source.estimate && (
            <span className="text-muted-foreground tabular-nums">
              · {take} here, ~{source.estimate - take} to the warehouse
            </span>
          )}
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={toggle}>
            {pending ? <Spinner /> : <ArrowRightLeftIcon />}
            {take < source.estimate ? `Transfer ${take}${unit} to this site` : "Transfer to this site"}
          </Button>
        </>
      )}
    </li>
  )
}
