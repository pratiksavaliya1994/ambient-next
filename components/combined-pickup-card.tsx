"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { ShoppingCartIcon } from "lucide-react"

import { MaterialsField } from "@/components/materials-field"
import { PickupToolPicker, selectionOfTools, type PickupSelection } from "@/components/pickup-tool-picker"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { PickupTool } from "@/lib/bubble/pickup-tools"
import { defaultMaterialsFor, type Job, type MaterialDefault } from "@/lib/bubble/reference-types"
import type { CombinedRequestFormValues } from "@/lib/schemas/combined-request"

/**
 * The inbound half: individual physical `tools` rows currently recorded at the
 * job, fetched live when the job is picked, exactly as `/requests/new/pickup`
 * picks them. Checking a tool keeps whatever condition Bubble holds; the picker
 * then lets it be changed deliberately.
 */
export function CombinedPickupCard({
  form,
  job,
  tools,
  loading,
  selected,
  onChange,
  onLoadTools,
  materialDefaults,
}: {
  form: UseFormReturn<CombinedRequestFormValues>
  job: Job | null
  tools: PickupTool[]
  loading: boolean
  selected: Map<string, PickupSelection>
  onChange: (next: Map<string, PickupSelection>) => void
  onLoadTools: (target: Job) => Promise<PickupTool[]>
  materialDefaults: MaterialDefault[]
}) {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = form
  const toDo = useWatch({ control, name: "toDo" })
  const materials = useWatch({ control, name: "pickupMaterials" })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-pickup-foreground">
          <ShoppingCartIcon className="size-4" />
          Pick up from site <span className="text-destructive">*</span>
        </CardTitle>
        <CardDescription>
          {!job ? "Pick a job to see its tools." : loading ? "Loading tools…" : `${selected.size} of ${tools.length} selected`}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          {selected.size > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(new Map())}>
              Clear all
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={tools.length === 0 || selected.size === tools.length}
            onClick={() => onChange(selectionOfTools(tools))}
          >
            Select all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-6">
          <Field data-invalid={errors.pickupTools ? true : undefined}>
            <PickupToolPicker
              tools={tools}
              loading={loading}
              hasJob={job !== null}
              selected={selected}
              onChange={onChange}
            />
            {errors.pickupTools && <FieldError errors={[errors.pickupTools]} />}
          </Field>

          <Field orientation="horizontal">
            <Controller
              control={control}
              name="cleanup"
              render={({ field }) => (
                <Switch
                  id="cleanup"
                  checked={field.value}
                  disabled={!job}
                  onCheckedChange={(next) => {
                    const checked = next === true
                    field.onChange(checked)
                    if (!checked || !job) return
                    // The job-select fetch usually landed already — select what
                    // is on screen rather than reloading the same list. If it
                    // hasn't (toggled mid-flight, or it came back empty), fetch
                    // first so the toggle can't select nothing.
                    if (tools.length > 0) return onChange(selectionOfTools(tools))
                    void onLoadTools(job).then((fetched) => onChange(selectionOfTools(fetched)))
                  }}
                />
              )}
            />
            <FieldLabel htmlFor="cleanup">Cleanup the Site — take everything on file</FieldLabel>
          </Field>

          <MaterialsField
            label="Materials to pick up"
            emptyText="No pickup materials added."
            value={materials}
            defaultText={defaultMaterialsFor(materialDefaults, toDo)}
            onChange={(next) => setValue("pickupMaterials", next, { shouldValidate: true })}
          />

          <Field>
            <FieldLabel htmlFor="pickupToolsNotes">Pickup tool notes</FieldLabel>
            <Textarea
              id="pickupToolsNotes"
              rows={2}
              placeholder="Anything the warehouse needs to know about what comes back"
              {...register("pickupToolsNotes")}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
