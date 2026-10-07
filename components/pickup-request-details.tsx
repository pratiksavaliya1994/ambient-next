"use client"

import { Controller } from "react-hook-form"

import {
  PickupOwnerFields,
  PickupScheduleFields,
  PickupSiteFields,
} from "@/components/pickup-request-fieldsets"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PickupRequestController } from "@/hooks/use-pickup-request"
import { TO_DO } from "@/lib/bubble/enums"
import type { FieldPm, Job } from "@/lib/bubble/reference-types"

/**
 * The pickup form's left-hand card: where the tools are coming from, when, and
 * who to ask for on site. The job picked here is what the tool list and the
 * materials hint are read for.
 */
export function PickupRequestDetails({
  controller,
  jobs,
  fieldPms,
}: {
  controller: PickupRequestController
  jobs: Job[]
  fieldPms: FieldPm[]
}) {
  const { form } = controller
  const toDoError = form.formState.errors.toDo

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pickup details</CardTitle>
        <CardDescription>Where the tools are coming from, when, and who to ask for on site.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <PickupJobField controller={controller} jobs={jobs} />

          <Field>
            <FieldLabel htmlFor="gc">GC</FieldLabel>
            <Input id="gc" placeholder="Enter GC" {...form.register("gc")} />
          </Field>

          <Field data-invalid={toDoError ? true : undefined}>
            <FieldLabel htmlFor="toDo">
              Job type <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              control={form.control}
              name="toDo"
              render={({ field }) => (
                <Select
                  items={TO_DO.map((value) => ({ label: value, value }))}
                  value={field.value ?? null}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="toDo" onBlur={field.onBlur} aria-invalid={toDoError ? true : undefined}>
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
            {toDoError && <FieldError errors={[toDoError]} />}
          </Field>

          <PickupSiteFields form={form} />
          <PickupScheduleFields controller={controller} />
          <PickupOwnerFields form={form} fieldPms={fieldPms} />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function PickupJobField({ controller, jobs }: { controller: PickupRequestController; jobs: Job[] }) {
  const { job, updateJob } = controller
  const error = controller.form.formState.errors.jobId

  return (
    <Field className="sm:col-span-2" data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="job">
        Job <span className="text-destructive">*</span>
      </FieldLabel>
      <Combobox
        items={jobs}
        value={job}
        onValueChange={(next) => updateJob((next as Job) ?? null)}
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
                      {[item.gc, item.borough, item.description].filter(Boolean).join(" · ") || "No GC Found"}
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
