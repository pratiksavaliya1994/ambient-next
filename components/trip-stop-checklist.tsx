"use client"

import type { LucideIcon } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"

/**
 * A stop's tools, each ticked until the driver says otherwise.
 *
 * **Opt-out, both times it is used.** Everything is assumed to have gone to
 * plan, and a tick removed is the exception being recorded — which is why the
 * row grows a flag rather than there being two buttons per tool. The old screen
 * said the same thing with paired Picked up / Not picked up buttons, one tool at
 * a time, in far more space.
 *
 * Shared rather than local because the two halves of a stop now fail the same
 * way and must look identical doing it: a collect that couldn't be taken, and a
 * drop the site turned away. Only the flag differs, so only the flag is a prop.
 */
export function TripStopChecklist({
  items,
  checked,
  onToggle,
  disabled,
  verb,
  flag,
}: {
  items: readonly { toolId: string; toolName: string }[]
  checked: ReadonlySet<string>
  onToggle: (toolId: string, checked: boolean) => void
  disabled?: boolean
  /** Reads into the checkbox's label: "Collected Pallet Jack", "Delivered Pallet Jack". */
  verb: string
  /** Shown on an unticked row — what saying no here means. */
  flag: { Icon: LucideIcon; label: string }
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.toolId} className="flex items-center gap-2">
          <Checkbox
            checked={checked.has(item.toolId)}
            onCheckedChange={(next) => onToggle(item.toolId, next === true)}
            aria-label={`${verb} ${item.toolName}`}
            disabled={disabled}
          />
          <span className="min-w-0 flex-1 truncate text-xs">{item.toolName}</span>
          {!checked.has(item.toolId) && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-status-attention-foreground">
              <flag.Icon className="size-3" />
              {flag.label}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
