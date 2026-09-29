"use client"

import { CheckIcon } from "lucide-react"
import type * as React from "react"
import { Controller, useFormContext } from "react-hook-form"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TO_DO, UNFILTERED_TO_DO, type ToDo } from "@/lib/bubble/enums"
import type { MaterialItemFormValues } from "@/lib/schemas/material"

/**
 * `Fast Request` means "show everything" (see `itemsFor`), so tying an item to
 * it would say nothing — it isn't offered as a choice.
 */
const JOB_TYPE_CHOICES = TO_DO.filter((value) => value !== UNFILTERED_TO_DO)

/**
 * The catalogue fields both item forms share: unit, category, job types,
 * notes. `children` lands after category, in the grid's second row, which is
 * where each form puts its one field of its own — opening stock on create, the
 * retire switch on edit.
 *
 * Reads the form through `useFormContext` for the reason `MaterialNameField`
 * does: the two forms' value shapes both extend `MaterialItemFormValues`.
 */
export function MaterialItemFields({ children }: { children?: React.ReactNode }) {
  const { control, register, formState } = useFormContext<MaterialItemFormValues>()
  const { errors } = formState

  return (
    <>
      <Field data-invalid={errors.unit ? true : undefined}>
        <FieldLabel htmlFor="unit">Unit</FieldLabel>
        <Input
          id="unit"
          placeholder="bag, box, gal, each"
          autoComplete="off"
          aria-invalid={errors.unit ? true : undefined}
          {...register("unit")}
        />
        {errors.unit && <FieldError>{errors.unit.message}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="category">Category</FieldLabel>
        <Input id="category" placeholder="Adhesives, mesh, sealers" autoComplete="off" {...register("category")} />
      </Field>

      {children}

      <Field className="sm:col-span-2">
        <FieldLabel>Job types</FieldLabel>
        <Controller
          control={control}
          name="relatedTo"
          render={({ field }) => (
            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              className="flex-wrap"
              value={field.value}
              onValueChange={(next) => field.onChange(next as ToDo[])}
            >
              {JOB_TYPE_CHOICES.map((value) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  className="group/job aria-pressed:border-primary aria-pressed:bg-primary/15 aria-pressed:text-primary aria-pressed:hover:bg-primary/25"
                >
                  <CheckIcon className="hidden group-aria-pressed/job:block" />
                  {value}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        />
        <FieldDescription>Which job types offer it on a request. Leave them all off to offer it everywhere.</FieldDescription>
      </Field>

      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="notes">Notes</FieldLabel>
        <Textarea id="notes" rows={2} placeholder="Supplier, shelf, anything the warehouse should know" {...register("notes")} />
      </Field>
    </>
  )
}
