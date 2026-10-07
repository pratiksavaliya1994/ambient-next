"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"

import { DatePicker } from "@/components/date-picker"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { WE_ARE } from "@/lib/bubble/enums"
import type { FieldPm } from "@/lib/bubble/reference-types"
import type { CombinedRequestFormValues } from "@/lib/schemas/combined-request"

/**
 * The shared half of the combined form, split into three groups purely to keep
 * each component inside the size rules in `CLAUDE.md`. They are grid children —
 * the `FieldGroup` that lays them out belongs to `CombinedRequestDetails`.
 *
 * Every field here is entered once and written to **both** requests. What
 * differs between the two halves (tools, materials, tool notes) lives on the
 * delivery and pickup cards instead.
 */
type Props = { form: UseFormReturn<CombinedRequestFormValues> }

/** Where on the job, and who to ask for — identical on both requests. */
export function CombinedSiteFields({ form }: Props) {
  const { register } = form

  return (
    <>
      <Field>
        <FieldLabel htmlFor="floor">Floor</FieldLabel>
        <Input id="floor" placeholder="Enter floor" {...register("floor")} />
      </Field>

      <Field>
        <FieldLabel htmlFor="contact">Site contact</FieldLabel>
        <Input id="contact" placeholder="Enter contact name" {...register("contact")} />
      </Field>

      <Field>
        <FieldLabel htmlFor="contactPhone">Contact phone</FieldLabel>
        <Input id="contactPhone" inputMode="tel" placeholder="Enter phone number" {...register("contactPhone")} />
      </Field>
    </>
  )
}

/**
 * One date and one preferred time for both halves — the delivery's range
 * collapses to that single day. A pickup and a delivery on different days are
 * two ordinary requests, which the two single-purpose pages already make.
 */
export function CombinedScheduleFields({ form }: Props) {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = form
  const date = useWatch({ control, name: "date" })

  return (
    <>
      <Field data-invalid={errors.date ? true : undefined}>
        <FieldLabel htmlFor="date">
          Date <span className="text-destructive">*</span>
        </FieldLabel>
        <DatePicker
          id="date"
          value={date}
          onValueChange={(next) => setValue("date", next, { shouldValidate: true })}
          invalid={errors.date ? true : undefined}
        />
        <FieldDescription>Used for both the pickup and the delivery.</FieldDescription>
        {errors.date && <FieldError errors={[errors.date]} />}
      </Field>

      <Field>
        <FieldLabel htmlFor="timeRange">Preferred time</FieldLabel>
        <Input id="timeRange" placeholder="Enter preferred time" {...register("timeRange")} />
        <FieldDescription>Leave blank if there is no preference.</FieldDescription>
      </Field>

      <Field orientation="horizontal">
        <Controller
          control={control}
          name="tentative"
          render={({ field }) => (
            <Switch id="tentative" checked={field.value} onCheckedChange={(next) => field.onChange(next === true)} />
          )}
        />
        <FieldLabel htmlFor="tentative">Tentative — the date may still move</FieldLabel>
      </Field>
    </>
  )
}

/** Who the request is for and belongs to, plus the notes both rows carry. */
export function CombinedOwnerFields({ form, fieldPms }: Props & { fieldPms: FieldPm[] }) {
  const {
    control,
    register,
    formState: { errors },
  } = form
  const pmItems = fieldPms.map((pm) => ({
    label: pm.company ? `${pm.name} — ${pm.company}` : pm.name,
    value: pm.name,
  }))

  return (
    <>
      <Field data-invalid={errors.weAre ? true : undefined}>
        <FieldLabel htmlFor="weAre">
          We are <span className="text-destructive">*</span>
        </FieldLabel>
        <Controller
          control={control}
          name="weAre"
          render={({ field }) => (
            <Select
              items={WE_ARE.map((value) => ({ label: value, value }))}
              value={field.value ?? null}
              onValueChange={field.onChange}
            >
              <SelectTrigger id="weAre" onBlur={field.onBlur} aria-invalid={errors.weAre ? true : undefined}>
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {WE_ARE.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
        {errors.weAre && <FieldError errors={[errors.weAre]} />}
      </Field>

      <Field>
        <FieldLabel htmlFor="fieldPm">Field PM</FieldLabel>
        <Controller
          control={control}
          name="fieldPm"
          render={({ field }) => (
            <Select
              items={pmItems}
              value={field.value || null}
              onValueChange={(next) => field.onChange((next as string | null) ?? "")}
            >
              <SelectTrigger id="fieldPm" onBlur={field.onBlur}>
                <SelectValue placeholder="Select field PM" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {pmItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="notes">Notes</FieldLabel>
        <Textarea id="notes" rows={2} placeholder="Add notes" {...register("notes")} />
      </Field>
    </>
  )
}
