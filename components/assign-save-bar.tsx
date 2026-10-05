"use client"

import Link from "next/link"
import { ArrowLeftIcon, CheckIcon, RotateCcwIcon, SaveIcon } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { assignedLabel } from "@/lib/bubble/assigned-tools-types"

/**
 * The assign screen's sticky footer: what the draft holds, and Save.
 *
 * With nothing unsaved it says so and offers the way back, rather than a
 * disabled Save that reads as broken. That's the usual state after linking a
 * transfer: a link writes the moment it's made, so it never waits here.
 */
export function AssignSaveBar({
  requestId,
  filled,
  requested,
  extras,
  materialsChanged,
  hasMaterials,
  dirty,
  pending,
  onReset,
  onSave,
}: {
  requestId: string
  filled: number
  requested: number
  extras: number
  materialsChanged: number
  hasMaterials: boolean
  dirty: boolean
  pending: boolean
  onReset: () => void
  onSave: () => void
}) {
  const parts = [
    // A materials-only request has no tool slots to count.
    requested > 0 || filled > 0 ? assignedLabel(filled, requested) : null,
    extras > 0 ? `${extras} extra` : null,
    materialsChanged > 0 ? `${materialsChanged} material ${materialsChanged === 1 ? "line" : "lines"} changed` : null,
  ].filter(Boolean)

  return (
    // Sticky, because the slot list is as long as the request is big and the
    // count is the thing a PM checks before saving.
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/95 p-3 backdrop-blur">
      <span className="text-sm text-muted-foreground tabular-nums">
        {dirty ? (
          [...parts, "unsaved"].join(" · ")
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon className="size-4 text-status-ok-foreground" />
            {[...parts, "Everything is saved"].join(" · ")}
            {hasMaterials && " — transfers save as soon as you choose them."}
          </span>
        )}
      </span>
      <div className="flex items-center gap-2">
        {dirty ? (
          <>
            <Button variant="ghost" size="sm" disabled={pending} onClick={onReset}>
              <RotateCcwIcon />
              Reset
            </Button>
            {/* The action revalidates this route, so a successful save
                re-renders with the saved values and `dirty` falls back to false. */}
            <Button size="sm" disabled={pending} onClick={onSave}>
              {pending ? <Spinner /> : <SaveIcon />}
              Save assignment
            </Button>
          </>
        ) : (
          <Link href={`/requests/${requestId}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            <ArrowLeftIcon />
            Back to request
          </Link>
        )}
      </div>
    </div>
  )
}
