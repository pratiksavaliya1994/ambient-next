"use client"

import { DatePicker } from "@/components/date-picker"
import { TimePicker } from "@/components/time-picker"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { formatClock, STOP_DURATION_MINUTES, STOP_INTERVAL_MINUTES, tripFinishMinutes } from "@/lib/trips/schedule"

/**
 * When the driver leaves — the day and the hour, as one field.
 *
 * They sit together under a single **Starts** label rather than as a "Date"
 * field and a "Time" field, because the pair is one decision: the trip doesn't
 * happen on a date, it happens at a moment, and every stop's window is counted
 * forward from that moment.
 *
 * The description says the rule *and* its consequence — 30 minutes a stop, an
 * hour between them, back by 9:30 — so a dispatcher can see the day won't fit
 * before saving, not after reading the route. That is the whole reason the
 * finish time is quoted here instead of only on the run sheet.
 */
export function TripStartField({
  tripDate,
  startTime,
  stopCount,
  disabled,
  onDateChange,
  onStartTimeChange,
}: {
  /** `yyyy-mm-dd`. */
  tripDate: string
  /** `"HH:mm"`. */
  startTime: string
  stopCount: number
  disabled?: boolean
  onDateChange: (date: string) => void
  onStartTimeChange: (time: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor="trip-date">Starts</FieldLabel>
      {/* 3:2 — the date label (`Thu 9-10, 2026`) is roughly twice the width of
          a clock time, and an even split leaves it truncating at phone width. */}
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
        <DatePicker id="trip-date" value={tripDate} onValueChange={onDateChange} />
        <TimePicker
          id="trip-start-time"
          value={startTime}
          onValueChange={onStartTimeChange}
          label="Start time"
          disabled={disabled}
        />
      </div>
      <FieldDescription>
        {STOP_DURATION_MINUTES} minutes a stop, {STOP_INTERVAL_MINUTES / 60} hour apart
        {stopCount > 0 ? ` — last stop ends ${formatClock(tripFinishMinutes(startTime, stopCount))}.` : "."}
      </FieldDescription>
    </Field>
  )
}
