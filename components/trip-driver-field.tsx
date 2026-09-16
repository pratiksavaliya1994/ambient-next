"use client"

import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * Who is driving: a `Select` **and** a free-text `Input` bound to one value.
 *
 * Lifted wholesale from `DispatchSendPanel`, including the reason — `pms` and
 * `user` are a convenience list, not a driver roster (no such table exists in
 * Bubble), so `trip.driver` stays free text and the picker only saves typing.
 *
 * Split out of `TripDriverPanel` when the start date grew a time beside it and
 * the panel went over the file's component budget.
 */
export function TripDriverField({
  driver,
  driverOptions,
  onDriverChange,
}: {
  driver: string
  driverOptions: string[]
  onDriverChange: (driver: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor="trip-driver">Driver</FieldLabel>
      <Select
        items={driverOptions.map((value) => ({ label: value, value }))}
        value={driverOptions.includes(driver) ? driver : null}
        onValueChange={(next) => next !== null && onDriverChange(next)}
      >
        <SelectTrigger id="trip-driver" aria-label="Driver">
          <SelectValue placeholder="Pick a driver" />
        </SelectTrigger>
        <SelectContent className="w-fit min-w-(--anchor-width)">
          <SelectGroup>
            {driverOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input
        value={driver}
        onChange={(event) => onDriverChange(event.target.value)}
        placeholder="…or type a name"
        aria-label="Driver name"
      />
    </Field>
  )
}
