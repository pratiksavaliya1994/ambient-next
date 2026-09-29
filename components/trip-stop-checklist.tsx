"use client"

import type { LucideIcon } from "lucide-react"

import { CargoKindIcon } from "@/components/cargo-kind"
import { Checkbox } from "@/components/ui/checkbox"
import type { StopRow } from "@/lib/trips/stop-checklist"
import { cn } from "@/lib/utils"

/**
 * A stop's tools and material lines, each ticked until the driver says
 * otherwise.
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
 * Material lines are rows here like any tool — tick-only, no quantity.
 */
export function TripStopChecklist({
  items,
  checked,
  onToggle,
  disabled,
  verb,
  flag,
}: {
  items: readonly StopRow[]
  checked: ReadonlySet<string>
  onToggle: (id: string, checked: boolean) => void
  disabled?: boolean
  /** Reads into the checkbox's label: "Collected Pallet Jack", "Delivered 20 bag Level-Flor". */
  verb: string
  /** Shown on an unticked row — what saying no here means. */
  flag: { Icon: LucideIcon; label: string }
}) {
  return (
    <ul className="flex flex-col gap-3 lg:gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded border border-l-4 px-2",
            item.kind === "material"
              ? "border-dashed border-material/40 border-l-material bg-material/5"
              : "border-l-foreground/25 bg-muted"
          )}
        >
          <Checkbox
            checked={checked.has(item.id)}
            onCheckedChange={(next) => onToggle(item.id, next === true)}
            aria-label={`${verb} ${item.label}`}
            disabled={disabled}
          />
          <CargoKindIcon kind={item.kind} />
          <span
            className="min-w-0 flex-1 cursor-pointer truncate py-1 text-sm select-none"
            onClick={() => !disabled && onToggle(item.id, !checked.has(item.id))}
          >
            {item.label}
          </span>
          {!checked.has(item.id) && (
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
