"use client"

import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * A whole-number stepper — minus, a typed value, plus — clamped to
 * `[min, max]` on every change, so the caller never sees a value outside it.
 *
 * Shared by the material picker, the request form's line list and the assign
 * card. The tool picker keeps its own: its quantity lives in a map keyed by
 * type name and tops out at 99, where a material line is a plain number that
 * can run to hundreds of units — hence the typed middle.
 */
export function QuantityStepper({
  value,
  onChange,
  label,
  min = 0,
  max = 99999,
  disabled = false,
  className,
}: {
  value: number
  onChange: (next: number) => void
  /** What is being counted — read by screen readers on all three controls. */
  label: string
  min?: number
  max?: number
  disabled?: boolean
  className?: string
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)))

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`One fewer ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <MinusIcon />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        aria-label={`${label} quantity`}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(clamp(next))
        }}
        className="h-8 w-16 [appearance:textfield] px-1 text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`One more ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}
