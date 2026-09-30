"use client"

import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/** Static shelf/bin in the warehouse — shared by the tool and material forms. */
export function WarehouseLocationField<T extends FieldValues>({
  control,
  name,
  className,
  error,
}: {
  control: Control<T>
  name: FieldPath<T>
  className?: string
  error?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={name}>Warehouse location</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Input
            id={name}
            placeholder="Rack B, Shelf 3"
            aria-invalid={error ? true : undefined}
            {...field}
            value={field.value ?? ""}
          />
        )}
      />
      <FieldDescription>Where it's kept in the warehouse. Doesn't change when it goes out on a job.</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
