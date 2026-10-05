"use client"

import { PackageXIcon } from "lucide-react"

import { CargoKindIcon } from "@/components/cargo-kind"
import { Input } from "@/components/ui/input"
import type { CountRow } from "@/lib/trips/stop-checklist"
import { cn } from "@/lib/utils"

/**
 * The pickup lines at their collect stop (5G §3): a **"Collected"** count for
 * each, with the PM's estimate beside it. Whole numbers, 0 or more.
 *
 * Prefilled with the estimate, for the driver to correct. A field cleared is a
 * question not answered yet, not a zero, and the stop's button waits until it
 * has a number again. `0` records the line as not collected and flags it so. A
 * count above the estimate is allowed: more came back than anyone knew about,
 * which is exactly what the count is for.
 */
export function TripStopCountList({
  rows,
  onCount,
  disabled,
}: {
  /** Each with its `count`: the driver's number, else the estimate, `null` once cleared. */
  rows: readonly CountRow[]
  onCount: (lineId: string, count: number | null) => void
  disabled?: boolean
}) {
  return (
    <ul className="flex flex-col gap-3 lg:gap-2">
      {rows.map((row) => {
        const count = row.count
        return (
          <li
            key={row.id}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded border border-l-4 border-dashed border-material/40 border-l-material px-2 py-1",
              count === 0 ? "bg-status-attention/5" : "bg-material/5"
            )}
          >
            <CargoKindIcon kind="material" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm" title={row.name}>
                {row.name}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {row.estimate} expected · to {row.to}
              </span>
            </div>
            {count === 0 && (
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-status-attention-foreground">
                <PackageXIcon className="size-3" />
                Not collected
              </span>
            )}
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              Collected
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={count ?? ""}
                placeholder="?"
                disabled={disabled}
                aria-label={`Collected ${row.name}${row.unit ? ` (${row.unit})` : ""}`}
                onChange={(event) => onCount(row.id, parseCount(event.target.value))}
                className="h-8 w-20 text-center tabular-nums"
              />
              {row.unit && <span>{row.unit}</span>}
            </label>
          </li>
        )
      })}
    </ul>
  )
}

/** A whole number ≥ 0, or `null` for an empty (or unusable) field. */
function parseCount(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 99999 ? parsed : null
}
