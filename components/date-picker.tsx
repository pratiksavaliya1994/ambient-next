"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * A `yyyy-mm-dd` calendar date, picked from a real calendar rather than the
 * browser's `input[type=date]` — which renders differently on every platform
 * and is close to unusable on mobile Safari.
 *
 * The value stays a plain `yyyy-mm-dd` string because that is what
 * `newYorkInstant` takes: the day is a New York wall-clock date, not an
 * instant. `Date` is only ever the widget's internal representation, and it is
 * built and read back with local-time getters so no timezone shift can happen
 * on the way through. `new Date("2026-08-24")` would parse as UTC midnight and
 * render as the 23rd for anyone west of Greenwich — hence the manual parse.
 */
function parseDay(day: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function formatDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

const LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
})

export function DatePicker({
  id,
  value,
  onValueChange,
  invalid,
}: {
  id?: string
  value: string
  onValueChange: (next: string) => void
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = parseDay(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-invalid={invalid ? true : undefined}
        render={
          <Button variant="outline" className="w-full justify-between px-3" />
        }
      >
        <span className={selected ? undefined : "text-muted-foreground"}>
          {selected ? LABEL.format(selected) : "Pick a date"}
        </span>
        <CalendarIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(next) => {
            if (!next) return
            onValueChange(formatDay(next))
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
