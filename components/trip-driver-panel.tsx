"use client"

import { CheckIcon } from "lucide-react"

import { TripDriverField } from "@/components/trip-driver-field"
import { TripStartField } from "@/components/trip-start-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

/**
 * Who is driving, when they leave, and the Save button.
 *
 * The two pickers are their own components — `TripDriverField` and
 * `TripStartField` — so this stays a layout, not a form. The start **time**
 * matters more than it looks: it is the only input to every stop time on every
 * trip screen, since those are derived from it rather than stored.
 */
export function TripDriverPanel({
  driver,
  driverOptions,
  tripDate,
  startTime,
  notes,
  toolCount,
  stopCount,
  problem,
  pending,
  saveLabel,
  onDriverChange,
  onDateChange,
  onStartTimeChange,
  onNotesChange,
  onSave,
}: {
  driver: string
  driverOptions: string[]
  tripDate: string
  /** `"HH:mm"`, New York wall clock. */
  startTime: string
  notes: string
  toolCount: number
  stopCount: number
  /** The first blocking problem, or `null` when the trip is saveable. */
  problem: string | null
  pending: boolean
  saveLabel: string
  onDriverChange: (driver: string) => void
  onDateChange: (date: string) => void
  onStartTimeChange: (time: string) => void
  onNotesChange: (notes: string) => void
  onSave: () => void
}) {
  return (
    <FieldGroup>
      <TripDriverField driver={driver} driverOptions={driverOptions} onDriverChange={onDriverChange} />

      <TripStartField
        tripDate={tripDate}
        startTime={startTime}
        stopCount={stopCount}
        disabled={pending}
        onDateChange={onDateChange}
        onStartTimeChange={onStartTimeChange}
      />

      <Field>
        <FieldLabel htmlFor="trip-notes">Notes</FieldLabel>
        <Textarea
          id="trip-notes"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Anything the driver should know"
          rows={2}
        />
      </Field>

      {problem && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}

      <Field orientation="horizontal" className="justify-between">
        <span className="text-xs text-muted-foreground tabular-nums">
          {toolCount} {toolCount === 1 ? "tool" : "tools"} · {stopCount} {stopCount === 1 ? "stop" : "stops"}
        </span>
        <Button onClick={onSave} disabled={pending || problem !== null || toolCount === 0 || !driver.trim()}>
          {pending ? <Spinner /> : <CheckIcon />}
          {saveLabel}
        </Button>
      </Field>
    </FieldGroup>
  )
}
