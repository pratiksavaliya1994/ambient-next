"use client"

import { useMemo } from "react"

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatClock, minutesOfTime, timeOfMinutes } from "@/lib/trips/schedule"

/**
 * An `"HH:mm"` wall-clock time, picked off a list rather than typed.
 *
 * A `Select` rather than `input[type=time]` for the same reason `DatePicker`
 * isn't `input[type=date]`: the native control renders differently on every
 * platform and is close to unusable on mobile Safari. The list is also the
 * cheaper guard — only real departure times are offered, so there is no
 * half-typed `0:6` state to validate against.
 *
 * Quarter-hours from 4 AM to 8 PM covers every plausible departure without
 * pretending anyone schedules a truck to the minute. A value outside that range
 * — a legacy row, or one written by something else — is **added to the list**
 * rather than snapped to the nearest slot, so opening a saved trip never
 * quietly changes its time.
 */
const FIRST_MINUTES = 4 * 60
const LAST_MINUTES = 20 * 60
const STEP_MINUTES = 15

export function TimePicker({
  id,
  value,
  onValueChange,
  label = "Time",
  disabled,
}: {
  id?: string
  /** `"HH:mm"`. */
  value: string
  onValueChange: (next: string) => void
  /** What a screen reader announces, where the visible label belongs to a field shared with another control. */
  label?: string
  disabled?: boolean
}) {
  const items = useMemo(() => {
    const slots: string[] = []
    for (let minutes = FIRST_MINUTES; minutes <= LAST_MINUTES; minutes += STEP_MINUTES) {
      slots.push(timeOfMinutes(minutes))
    }
    if (!slots.includes(value)) {
      slots.push(value)
      slots.sort((a, b) => minutesOfTime(a) - minutesOfTime(b))
    }
    return slots.map((slot) => ({ label: formatClock(minutesOfTime(slot)), value: slot }))
  }, [value])

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => next !== null && onValueChange(next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      {/* Sixty-odd quarter-hours is a long list: capped, scrollable, and hung
          below the trigger rather than trying to line the selected row up with
          it, which at this length pushes the popup off-screen. */}
      <SelectContent align="start" alignItemWithTrigger={false} className="max-h-72 w-(--anchor-width)">
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
