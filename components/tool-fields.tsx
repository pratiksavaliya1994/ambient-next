"use client"

import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ToolType } from "@/lib/bubble/reference-types"
import { TOOL_CONDITION } from "@/lib/bubble/tool-enums"

/**
 * The three widgets both tool forms need — type, condition and location.
 *
 * Generic over the form's value shape rather than tied to one, because the two
 * forms genuinely differ (`ToolEditFormValues` has no `name` and allows an
 * empty `typeId`; `ToolCreateFormValues` requires one and has no `markAvailable`)
 * while the controls themselves are identical. A second copy of a `Select` over
 * `TOOL_CONDITION` is exactly the kind of thing that drifts when the option set
 * next changes, and `CLAUDE.md` puts anything used by more than one feature in
 * a shared component.
 *
 * `name` is the RHF path rather than a fixed string for the same reason.
 */

export function ToolTypeField<T extends FieldValues>({
  control,
  name,
  toolTypes,
  placeholder = "No type set",
  error,
}: {
  control: Control<T>
  name: FieldPath<T>
  toolTypes: ToolType[]
  placeholder?: string
  error?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>Type</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            items={toolTypes.map((type) => ({ label: type.name, value: type.id }))}
            value={field.value || null}
            onValueChange={(next) => field.onChange((next as string | null) ?? "")}
          >
            <SelectTrigger id={name} aria-invalid={error ? true : undefined}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="max-w-(--available-width)">
              <SelectGroup>
                {toolTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

/**
 * `placeholder` carries the edit form's one subtlety: a live `condition` the
 * select can't represent (blank, or a legacy value the old Bubble UI wrote)
 * seeds the field empty and shows the raw value here instead, so it stays
 * visible rather than looking unset. The create form has no such value and
 * starts at `Ok`.
 */
export function ToolConditionField<T extends FieldValues>({
  control,
  name,
  placeholder = "Not set",
}: {
  control: Control<T>
  name: FieldPath<T>
  placeholder?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>Condition</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            items={TOOL_CONDITION.map((value) => ({ label: value, value }))}
            value={field.value || null}
            onValueChange={(next) => field.onChange((next as string | null) ?? "")}
          >
            <SelectTrigger id={name}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="max-w-(--available-width)">
              <SelectGroup>
                {TOOL_CONDITION.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      />
    </Field>
  )
}

/**
 * A picked value, never typed — the combobox is what keeps
 * `isKnownToolLocation`'s byte-for-byte check unreachable in the UI rather
 * than a trap. Both actions run it anyway.
 */
export function ToolLocationField<T extends FieldValues>({
  control,
  name,
  locations,
  disabled = false,
  className,
  error,
}: {
  control: Control<T>
  name: FieldPath<T>
  /** Every `jobs.name` plus the warehouse names, sorted. */
  locations: string[]
  disabled?: boolean
  className?: string
  error?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={name}>Location</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Combobox
            items={locations}
            value={field.value || null}
            onValueChange={(next) => field.onChange((next as string | null) ?? "")}
            disabled={disabled}
            limit={40}
          >
            <ComboboxInput
              id={name}
              placeholder="Search jobs and warehouses"
              aria-invalid={error ? true : undefined}
            />
            <ComboboxContent>
              <ComboboxEmpty>No job or warehouse matches.</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        )}
      />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
