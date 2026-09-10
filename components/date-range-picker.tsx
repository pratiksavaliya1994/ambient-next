"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { formatDay, formatDayLabel, parseDay } from "@/components/date-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * `startDate`/`endDate` as one range selection instead of two independent
 * date pickers. react-day-picker's own range-selection algorithm always
 * returns `from <= to` — clicking a day before the current start moves the
 * start rather than producing an inverted range — so the "end before start"
 * state the two-picker version could reach is no longer reachable from this
 * widget. `startDate`/`endDate` stay the two plain `yyyy-mm-dd` strings the
 * rest of the form already expects; only the widget that edits them changed.
 */
export function DateRangePicker({
  id,
  startDate,
  endDate,
  onRangeChange,
  invalid,
  className,
  placeholder = "Pick a date range",
}: {
  id?: string
  startDate: string
  endDate: string
  onRangeChange: (next: { startDate: string; endDate: string }) => void
  invalid?: boolean
  /**
   * Merged onto the trigger button. The default is the full-width trigger a
   * stacked form field wants; `request-search.tsx`'s toolbar overrides it
   * with `w-auto` so the trigger sizes to its own label instead of claiming
   * the whole row and pushing the buttons beside it off the edge.
   */
  className?: string
  /**
   * What the trigger reads when no range is picked. The default suits a form
   * field that has its own `FieldLabel`; a labelled control — the toolbar in
   * `request-search.tsx` — wants the empty state to name the *unfiltered*
   * case instead, not repeat its label.
   */
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: parseDay(startDate),
    to: parseDay(endDate),
  }))

  const label = !range?.from
    ? placeholder
    : !range.to || range.to.getTime() === range.from.getTime()
      ? formatDayLabel(range.from)
      : `${formatDayLabel(range.from)} – ${formatDayLabel(range.to)}`

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Re-derive from the committed form values every time the popover
        // opens, so a stale in-progress click (start picked, end not yet)
        // from a previous open never lingers into this one.
        if (next) {
          setRange({ from: parseDay(startDate), to: parseDay(endDate) })
        }
      }}
    >
      <PopoverTrigger
        id={id}
        aria-invalid={invalid ? true : undefined}
        render={<Button variant="outline" className={cn("w-full justify-between px-3", className)} />}
      >
        <span className={range?.from ? undefined : "text-muted-foreground"}>{label}</span>
        <CalendarIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={range}
          defaultMonth={range?.from}
          onSelect={(next) => {
            setRange(next)
            if (next?.from && next?.to) {
              onRangeChange({
                startDate: formatDay(next.from),
                endDate: formatDay(next.to),
              })
            }
          }}
          numberOfMonths={2}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
