"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"

import { DatePicker } from "@/components/date-picker"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { WE_ARE } from "@/lib/bubble/enums"
import type { FieldPm, TimeSlot } from "@/lib/bubble/reference-types"
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
 * One date and one slot for both halves — the delivery's range collapses to
 * that single day. A pickup and a delivery on different days are two ordinary
 * requests, which the two single-purpose pages already make.
 */
export function CombinedScheduleFields({ form, timeSlots }: Props & { timeSlots: TimeSlot[] }) {
  const {
    control,
    setValue,
    formState: { errors },
  } = form
  const date = useWatch({ control, name: "date" })
  const slotItems = timeSlots.map((slot) => ({ label: slot.label, value: slot.label }))

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
        <FieldLabel htmlFor="slot">Time slot</FieldLabel>
        <Controller
          control={control}
          name="timeRange"
          render={({ field }) => (
            <Select
              items={slotItems}
              value={field.value}
              onValueChange={(next) => {
                field.onChange(next)
                const hour = timeSlots.find((slot) => slot.label === next)?.hour
                if (hour !== undefined) setValue("slotHour", hour)
              }}
            >
              <SelectTrigger id="slot" onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {slotItems.map((item) => (
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

      <Field orientation="horizontal" className="sm:col-span-2">
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
  const { control, register } = form
  const pmItems = fieldPms.map((pm) => ({
    label: pm.company ? `${pm.name} — ${pm.company}` : pm.name,
    value: pm.name,
  }))

  return (
    <>
      <Field>
        <FieldLabel htmlFor="weAre">We are</FieldLabel>
        <Controller
          control={control}
          name="weAre"
          render={({ field }) => (
            <Select
              items={WE_ARE.map((value) => ({ label: value, value }))}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger id="weAre" onBlur={field.onBlur}>
                <SelectValue />
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
      </Field>

      <Field>
        <FieldLabel htmlFor="fieldPm">Field PM</FieldLabel>
        <Controller
          control={control}
          name="fieldPm"
          render={({ field }) => (
            <Select items={pmItems} value={field.value} onValueChange={(next) => field.onChange(String(next))}>
              <SelectTrigger id="fieldPm" onBlur={field.onBlur}>
                <SelectValue />
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
