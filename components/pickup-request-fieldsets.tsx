"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"

import { DatePicker } from "@/components/date-picker"
import { CleanupSiteSwitch } from "@/components/pickup-tools-controls"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { PickupRequestController } from "@/hooks/use-pickup-request"
import { WE_ARE } from "@/lib/bubble/enums"
import type { FieldPm, TimeSlot } from "@/lib/bubble/reference-types"
import type { PickupRequestFormValues } from "@/lib/schemas/pickup-request"

/**
 * The pickup form's details, split into three groups purely to keep each
 * component inside the size rules in `CLAUDE.md`. They are grid children — the
 * `FieldGroup` that lays them out belongs to `PickupRequestDetails`.
 */
type Props = { form: UseFormReturn<PickupRequestFormValues> }

/** Where on the job, and who to ask for. */
export function PickupSiteFields({ form }: Props) {
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
 * The date and slot, tentative, and "Cleanup the Site" — which auto-selects
 * (but doesn't lock) every tool on file at the job.
 */
export function PickupScheduleFields({
  controller,
  timeSlots,
}: {
  controller: PickupRequestController
  timeSlots: TimeSlot[]
}) {
  const { form, job, toolsForJob, loadToolsForJob, updateSelected } = controller
  const {
    control,
    setValue,
    formState: { errors },
  } = form
  const [date, cleanup] = useWatch({ control, name: ["date", "cleanup"] })
  const slotItems = timeSlots.map((slot) => ({ label: slot.label, value: slot.label }))

  return (
    <>
      <Field data-invalid={errors.date ? true : undefined}>
        <FieldLabel htmlFor="date">
          Pickup date <span className="text-destructive">*</span>
        </FieldLabel>
        <DatePicker
          id="date"
          value={date}
          onValueChange={(next) => setValue("date", next, { shouldValidate: true })}
          invalid={errors.date ? true : undefined}
        />
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
        <FieldDescription>Time slot for the pickup</FieldDescription>
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

      <CleanupSiteSwitch
        checked={cleanup}
        onCheckedChange={(next) => setValue("cleanup", next)}
        job={job}
        tools={toolsForJob}
        onSelect={updateSelected}
        onLoadTools={loadToolsForJob}
      />
    </>
  )
}

/** Whose request it is, and anything else to say. */
export function PickupOwnerFields({ form, fieldPms }: Props & { fieldPms: FieldPm[] }) {
  const { control, register } = form
  const pmItems = fieldPms.map((pm) => ({ label: pm.company ? `${pm.name} — ${pm.company}` : pm.name, value: pm.name }))
  const weAreItems = WE_ARE.map((value) => ({ label: value, value }))

  return (
    <>
      <Field>
        <FieldLabel htmlFor="weAre">We are</FieldLabel>
        <Controller
          control={control}
          name="weAre"
          render={({ field }) => (
            <Select items={weAreItems} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="weAre" onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {weAreItems.map((item) => (
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
