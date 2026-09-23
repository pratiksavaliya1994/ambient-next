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
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TO_DO } from "@/lib/bubble/enums"
import type { FieldPm, Job, TimeSlot } from "@/lib/bubble/reference-types"
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
  timeSlots,
}: {
  form: UseFormReturn<CombinedRequestFormValues>
  jobs: Job[]
  job: Job | null
  onJobChange: (next: Job | null) => void
  fieldPms: FieldPm[]
  timeSlots: TimeSlot[]
}) {
  const {
    control,
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
          <Field className="sm:col-span-2" data-invalid={errors.jobId ? true : undefined}>
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
              <ComboboxInput id="job" placeholder="Search jobs by name" aria-invalid={errors.jobId ? true : undefined} />
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
            {job && <FieldDescription className="font-semibold">GC: {job.gc || "None on file"}</FieldDescription>}
            {errors.jobId && <FieldError errors={[errors.jobId]} />}
          </Field>

          <Field>
            <FieldLabel htmlFor="toDo">Job type</FieldLabel>
            <Controller
              control={control}
              name="toDo"
              render={({ field }) => (
                <Select
                  items={TO_DO.map((value) => ({ label: value, value }))}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="toDo" onBlur={field.onBlur}>
                    <SelectValue />
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
          </Field>

          <CombinedSiteFields form={form} />
          <CombinedScheduleFields form={form} timeSlots={timeSlots} />
          <CombinedOwnerFields form={form} fieldPms={fieldPms} />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
