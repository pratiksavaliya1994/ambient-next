"use client"

import { Controller, type Control } from "react-hook-form"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { ToolEditFormValues } from "@/lib/schemas/tool"

/**
 * The gated half of the tool detail form — everything that says *where the tool
 * is and who has it*, plus the one status transition this page can make.
 *
 * Split from `tool-detail-form.tsx` to keep both inside `CLAUDE.md`'s 100-line
 * component ceiling, and because these three share one enable/disable rule
 * while the type and condition selects share none of it.
 */

export function ToolMovementFields({
  control,
  locations,
  disabled,
  releasing,
  error,
}: {
  control: Control<ToolEditFormValues>
  /** Every `jobs.name` plus the warehouse names, sorted. A picked value, never typed. */
  locations: string[]
  /** Something holds the tool — see `editabilityOf`. */
  disabled: boolean
  /** The release switch is on, so `currentUser` is about to be cleared regardless of the input. */
  releasing: boolean
  error?: string
}) {
  return (
    <>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="location">Location</FieldLabel>
        <Controller
          control={control}
          name="location"
          render={({ field }) => (
            <Combobox
              items={locations}
              value={field.value || null}
              onValueChange={(next) => field.onChange((next as string | null) ?? "")}
              disabled={disabled}
              limit={40}
            >
              <ComboboxInput id="location" placeholder="Search jobs and warehouses" aria-invalid={error ? true : undefined} />
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

      <Field>
        <FieldLabel htmlFor="floor">Floor</FieldLabel>
        <Controller
          control={control}
          name="floor"
          // `{...field}` first: RHF's render props carry their own `disabled`
          // key (undefined unless the whole form is disabled), which would
          // silently overwrite ours if it were spread last.
          render={({ field }) => (
            <Input id="floor" placeholder="14, ground, Suite 139" {...field} disabled={disabled} />
          )}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="currentUser">Current holder</FieldLabel>
        <Controller
          control={control}
          name="currentUser"
          render={({ field }) => (
            <Input
              id="currentUser"
              placeholder={releasing ? "Cleared on release" : "Nobody"}
              {...field}
              disabled={disabled || releasing}
              value={releasing ? "" : field.value}
            />
          )}
        />
      </Field>
    </>
  )
}

/**
 * The only write this page can make to `statusNew`, and it has exactly one
 * destination.
 *
 * A switch rather than a status dropdown because there is no second option and
 * there must never be one: every other value in `TOOL_STATUS_NEW` asserts a
 * claim backed by an `assignedtools` or `triptool` row, and nothing here
 * creates either. A select with one item would invite a second.
 */
export function ToolReleaseField({ control }: { control: Control<ToolEditFormValues> }) {
  return (
    <Field orientation="horizontal" className="sm:col-span-2">
      <Controller
        control={control}
        name="markAvailable"
        render={({ field }) => (
          <Switch
            id="markAvailable"
            checked={field.value}
            onCheckedChange={(next) => field.onChange(next === true)}
            aria-label="Release this tool to Available"
          />
        )}
      />
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor="markAvailable">Release to Available</FieldLabel>
        <FieldDescription>Also clears the current holder.</FieldDescription>
      </div>
    </Field>
  )
}
