import { ArrowDownToLineIcon, ArrowUpFromLineIcon, CheckIcon, PackageXIcon, UndoIcon, type LucideIcon } from "lucide-react"

import type { StopItem } from "@/components/trip-stop-item-line"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/**
 * What pressing "Done here" is about to do, spelled out before it happens.
 *
 * Recording a stop is **one-way** — there is no undo action once a tool is
 * marked collected, delivered or refused (see `TripStopActions`). A driver's
 * thumb slipping on the wrong checkbox has no recovery but a second, manual
 * correction elsewhere, so the last screen before that write lists every tool
 * by name, split exactly the way the action is about to split them, rather
 * than trusting a count on the button to have been read carefully.
 */
export function TripStopConfirmDialog({
  open,
  onOpenChange,
  collect,
  skip,
  drop,
  refuse,
  verb,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tools about to be recorded as collected. */
  collect: readonly StopItem[]
  /** Tools left behind at this stop — not collected. */
  skip: readonly StopItem[]
  /** Tools about to be recorded as delivered (or returned, at a warehouse). */
  drop: readonly StopItem[]
  /** Tools the site is about to be recorded as refusing. */
  refuse: readonly StopItem[]
  /** `Drop off` or `Return` — what `drop` is called at this stop. */
  verb: string
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm this stop</DialogTitle>
          <DialogDescription>This can&apos;t be undone. Check every tool below before confirming.</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {collect.length > 0 && (
            <ConfirmSection label="Collecting" Icon={ArrowUpFromLineIcon} tone="collect" items={collect} />
          )}
          {skip.length > 0 && <ConfirmSection label="Leaving behind" Icon={PackageXIcon} tone="warn" items={skip} />}
          {drop.length > 0 && <ConfirmSection label={verb} Icon={ArrowDownToLineIcon} tone="drop" items={drop} />}
          {refuse.length > 0 && (
            <ConfirmSection label="Refusing — back to warehouse" Icon={UndoIcon} tone="warn" items={refuse} />
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Cancel</DialogClose>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? <Spinner /> : <CheckIcon />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One group of tools in the summary — same shape as a stop's own collect/drop blocks, so it reads as familiar. */
function ConfirmSection({
  label,
  Icon,
  tone,
  items,
}: {
  label: string
  Icon: LucideIcon
  tone: "collect" | "drop" | "warn"
  items: readonly StopItem[]
}) {
  return (
    <section className="overflow-hidden rounded-md border">
      <header
        className={cn(
          "flex items-center gap-1.5 px-2 py-1",
          tone === "drop" && "bg-status-ok/15 text-status-ok-foreground",
          tone === "collect" && "bg-status-active/15 text-status-active-foreground",
          tone === "warn" && "bg-status-attention/15 text-status-attention-foreground"
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[11px] font-semibold tracking-wide uppercase">{label}</span>
        <span className="ml-auto text-[11px] font-medium tabular-nums">{items.length}</span>
      </header>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.toolId} className="flex items-center gap-2 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate font-medium" title={item.toolName}>
              {item.toolName}
            </span>
            {item.toolType && item.toolType !== item.toolName && (
              <span
                className="hidden min-w-0 shrink truncate text-[11px] text-muted-foreground sm:inline"
                title={item.toolType}
              >
                {item.toolType}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
