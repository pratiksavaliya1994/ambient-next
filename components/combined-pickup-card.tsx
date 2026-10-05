"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { ShoppingCartIcon } from "lucide-react"

import { MaterialLinesField } from "@/components/material-lines-field"
import { PickupToolPicker, type PickupSelection } from "@/components/pickup-tool-picker"
import { CleanupSiteSwitch, PickupToolsActions } from "@/components/pickup-tools-controls"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { SiteStockHint } from "@/hooks/use-site-stock-hint"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import type { PickupTool } from "@/lib/bubble/pickup-tools"
import type { Job } from "@/lib/bubble/reference-types"
import type { CombinedRequestFormValues } from "@/lib/schemas/combined-request"

/**
 * The inbound half: individual physical `tools` rows currently recorded at the
 * job, fetched live when the job is picked, exactly as `/requests/new/pickup`
 * picks them. Checking a tool keeps whatever condition Bubble holds; the picker
 * then lets it be changed deliberately.
 *
 * Its materials are lines to collect, entered by hand as estimates, with the
 * job's site figures as a hint (5G) — the pickup form's field exactly.
 */
export function CombinedPickupCard({
  form,
  job,
  tools,
  loading,
  selected,
  onChange,
  onLoadTools,
  materialItems,
  siteHint,
}: {
  form: UseFormReturn<CombinedRequestFormValues>
  job: Job | null
  tools: PickupTool[]
  loading: boolean
  selected: Map<string, PickupSelection>
  onChange: (next: Map<string, PickupSelection>) => void
  onLoadTools: (target: Job) => Promise<PickupTool[]>
  materialItems: MaterialItem[]
  siteHint: SiteStockHint
}) {
  const {
    control,
    register,
    setValue,
    trigger,
    formState: { errors },
  } = form
  const [toDo, cleanup] = useWatch({ control, name: ["toDo", "cleanup"] })

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
        <PickupToolsActions tools={tools} selected={selected} onChange={onChange} />
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

          <CleanupSiteSwitch
            checked={cleanup}
            onCheckedChange={(next) => setValue("cleanup", next)}
            job={job}
            tools={tools}
            onSelect={onChange}
            onLoadTools={onLoadTools}
          />

          {/* The refine is "a tool or a material line", reported on
              `pickupTools` — so a line change re-checks that too. */}
          <Controller
            control={control}
            name="pickupMaterialLines"
            render={({ field }) => (
              <MaterialLinesField
                mode="pickup"
                label="Materials to collect"
                lines={field.value}
                onChange={(next) => {
                  field.onChange(next)
                  void trigger(["pickupMaterialLines", "pickupTools"])
                }}
                items={materialItems}
                toDo={toDo}
                site={siteHint}
              />
            )}
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

