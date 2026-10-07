"use client"

import { Controller, type UseFormReturn } from "react-hook-form"

import {
  CombinedOwnerFields,
  CombinedScheduleFields,
  CombinedSiteFields,
} from "@/components/combined-request-fieldsets"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TO_DO } from "@/lib/bubble/enums"
import type { FieldPm, Job } from "@/lib/bubble/reference-types"
import type { CombinedRequestFormValues } from "@/lib/schemas/combined-request"

/**
 * The left-hand card: everything both requests share. The job picked here does
 * double duty — it is written to both rows, and it is what the pickup list of
 * physical tools is fetched for.
 */
export function CombinedRequestDetails({
  form,
  jobs,
  job,
  onJobChange,
  fieldPms,
}: {
  form: UseFormReturn<CombinedRequestFormValues>
  jobs: Job[]
  job: Job | null
  onJobChange: (next: Job | null) => void
  fieldPms: FieldPm[]
}) {
  const {
    control,
    register,
    formState: { errors },
  } = form

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shared details</CardTitle>
        <CardDescription>Entered once, written to both the pickup and the delivery request.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <CombinedJobField form={form} jobs={jobs} job={job} onJobChange={onJobChange} />

          <Field>
            <FieldLabel htmlFor="gc">GC</FieldLabel>
            <Input id="gc" placeholder="Enter GC" {...register("gc")} />
          </Field>

          <Field data-invalid={errors.toDo ? true : undefined}>
            <FieldLabel htmlFor="toDo">
              Job type <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              control={control}
              name="toDo"
              render={({ field }) => (
                <Select
                  items={TO_DO.map((value) => ({ label: value, value }))}
                  value={field.value ?? null}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="toDo" onBlur={field.onBlur} aria-invalid={errors.toDo ? true : undefined}>
                    <SelectValue placeholder="Select job type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TO_DO.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>Filters the delivery tool list.</FieldDescription>
            {errors.toDo && <FieldError errors={[errors.toDo]} />}
          </Field>

          <CombinedSiteFields form={form} />
          <CombinedScheduleFields form={form} />
          <CombinedOwnerFields form={form} fieldPms={fieldPms} />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function CombinedJobField({
  form,
  jobs,
  job,
  onJobChange,
}: {
  form: UseFormReturn<CombinedRequestFormValues>
  jobs: Job[]
  job: Job | null
  onJobChange: (next: Job | null) => void
}) {
  const error = form.formState.errors.jobId

  return (
    <Field className="sm:col-span-2" data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="job">
        Job <span className="text-destructive">*</span>
      </FieldLabel>
      <Combobox
        items={jobs}
        value={job}
        onValueChange={(next) => onJobChange((next as Job) ?? null)}
        itemToStringLabel={(item: Job) => item.name}
        itemToStringValue={(item: Job) => item.id}
        limit={40}
      >
        <ComboboxInput id="job" placeholder="Search jobs by name" aria-invalid={error ? true : undefined} />
        <ComboboxContent>
          <ComboboxEmpty>No job matches.</ComboboxEmpty>
          <ComboboxList>
            {(item: Job) => (
              <ComboboxItem key={item.id} value={item}>
                <Item size="xs" className="p-0">
                  <ItemContent>
                    <ItemTitle className="whitespace-nowrap">{item.name}</ItemTitle>
                    <ItemDescription>
                      {[item.gc, item.borough, item.description].filter(Boolean).join(" · ") || "No GC on file"}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error && <FieldError errors={[error]} />}
    </Field>
  )
}
