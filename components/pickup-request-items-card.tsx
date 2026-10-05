"use client"

import { Controller, useWatch } from "react-hook-form"
import { SendIcon } from "lucide-react"

import { MaterialLinesField } from "@/components/material-lines-field"
import { PickupToolPicker } from "@/components/pickup-tool-picker"
import { PickupToolsActions } from "@/components/pickup-tools-controls"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { PickupRequestController } from "@/hooks/use-pickup-request"
import type { MaterialItem } from "@/lib/bubble/material-items-types"

/**
 * What comes back: the job's physical tools, the material lines to collect,
 * and the submit. Either a tool or a line satisfies the form, so the refine's
 * error shows under the tools and a line change re-checks it.
 *
 * Materials are entered by hand as estimates (5G §1); the picker lists the
 * site's own items first as a hint, never a limit.
 */
export function PickupRequestItemsCard({
  controller,
  materialItems,
}: {
  controller: PickupRequestController
  /** The active catalogue, read fresh by the page. */
  materialItems: MaterialItem[]
}) {
  const { form, job, toolsForJob, toolsPending, selected, updateSelected, pending } = controller
  const {
    control,
    register,
    trigger,
    formState: { errors, isValid },
  } = form
  const toDo = useWatch({ control, name: "toDo" })

  return (
    <Card className="lg:sticky lg:top-18">
      <CardHeader>
        <CardTitle>
          Tools &amp; materials <span className="text-destructive">*</span>
        </CardTitle>
        <CardDescription>
          {!job
            ? "Pick a job to see its tools."
            : toolsPending
              ? "Loading tools…"
              : `${selected.size} of ${toolsForJob.length} tools selected`}
        </CardDescription>
        <PickupToolsActions tools={toolsForJob} selected={selected} onChange={updateSelected} />
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-6">
          <Field data-invalid={errors.tools ? true : undefined}>
            <PickupToolPicker
              tools={toolsForJob}
              loading={toolsPending}
              hasJob={job !== null}
              selected={selected}
              onChange={updateSelected}
            />
            {errors.tools && <FieldError errors={[errors.tools]} />}
          </Field>

          <Controller
            control={control}
            name="materialLines"
            render={({ field }) => (
              <MaterialLinesField
                mode="pickup"
                label="Materials to collect"
                lines={field.value}
                onChange={(next) => {
                  field.onChange(next)
                  void trigger(["materialLines", "tools"])
                }}
                items={materialItems}
                toDo={toDo}
                site={controller.siteHint}
              />
            )}
          />

          <Field>
            <FieldLabel htmlFor="toolsNotes">Tool notes</FieldLabel>
            <Textarea
              id="toolsNotes"
              rows={2}
              placeholder="Anything the warehouse needs to know"
              {...register("toolsNotes")}
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <Button type="submit" disabled={!isValid || pending}>
          {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
          Create pickup request
        </Button>
      </CardFooter>
    </Card>
  )
}
