"use client"

import { useMemo } from "react"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { PlusIcon, TruckIcon } from "lucide-react"

import { MaterialLinesField } from "@/components/material-lines-field"
import { SelectedTools, ToolPickerDialog, toolLinesOf } from "@/components/tool-picker"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import { toolTypesFor, type ToolType } from "@/lib/bubble/reference-types"
import type { CombinedRequestFormValues } from "@/lib/schemas/combined-request"

/**
 * The outbound half: tool **types** with quantities, from the 112-row
 * `toolstype` catalogue, exactly as `/requests/new` picks them, and material
 * lines from the catalogue the same way. Its materials and tool notes are its
 * own — see `combinedRequestFormSchema`.
 */
export function CombinedDeliveryCard({
  form,
  toolTypes,
  materialItems,
  selected,
  onChange,
}: {
  form: UseFormReturn<CombinedRequestFormValues>
  toolTypes: ToolType[]
  materialItems: MaterialItem[]
  selected: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  const {
    control,
    register,
    trigger,
    formState: { errors },
  } = form
  const toDo = useWatch({ control, name: "toDo" })

  const tools = toolLinesOf(selected)
  const units = tools.reduce((sum, line) => sum + line.quantity, 0)
  // Switching the job type can strand a pick that is no longer offered.
  // Stranded picks stay selected on purpose, same as the delivery-only form.
  const offered = useMemo(() => toolTypesFor(toolTypes, toDo), [toolTypes, toDo])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-delivery-foreground">
          <TruckIcon className="size-4" />
          Deliver to site <span className="text-destructive">*</span>
        </CardTitle>
        <CardDescription>
          {tools.length === 0
            ? `${offered.length} tool types offered for ${toDo || "all job types"}`
            : `${tools.length} ${tools.length === 1 ? "type" : "types"}, ${units} in total`}
        </CardDescription>
        <CardAction>
          <ToolPickerDialog
            toolTypes={offered}
            selected={selected}
            onChange={onChange}
            toDo={toDo}
            catalogueSize={toolTypes.length}
            trigger={
              <Button type="button" variant="outline" size="sm">
                <PlusIcon data-icon="inline-start" />
                Add tools
              </Button>
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-6">
          <Field data-invalid={errors.deliveryTools ? true : undefined}>
            <SelectedTools selected={selected} onChange={onChange} />
            {errors.deliveryTools && <FieldError errors={[errors.deliveryTools]} />}
          </Field>

          {/* The refine is "a tool or a material line", reported on
              `deliveryTools` — so a line change re-checks that too. */}
          <Controller
            control={control}
            name="deliveryMaterialLines"
            render={({ field }) => (
              <MaterialLinesField
                label="Materials to deliver"
                lines={field.value}
                onChange={(next) => {
                  field.onChange(next)
                  void trigger(["deliveryMaterialLines", "deliveryTools"])
                }}
                items={materialItems}
                toDo={toDo}
              />
            )}
          />

          <Field>
            <FieldLabel htmlFor="deliveryToolsNotes">Delivery tool notes</FieldLabel>
            <Textarea
              id="deliveryToolsNotes"
              rows={2}
              placeholder="Anything the warehouse needs to know about what goes out"
              {...register("deliveryToolsNotes")}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
