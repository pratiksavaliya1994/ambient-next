"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { SaveIcon } from "lucide-react"
import * as React from "react"
import { useForm, useWatch } from "react-hook-form"

import { ToolCatalogueFields } from "@/components/tool-catalogue-fields"
import { ToolMovementFields, ToolReleaseField } from "@/components/tool-movement-fields"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldSeparator } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import type { ToolType } from "@/lib/bubble/reference-types"
import { TOOL_CONDITION } from "@/lib/bubble/tool-enums"
import { toolEditSchema, type ToolEditFormValues } from "@/lib/schemas/tool"
import type { ToolDetail, ToolEditability } from "@/lib/tools/tool-edit"
import { updateToolAction } from "@/app/(app)/tools/[toolId]/actions"
import { INITIAL_TOOL_EDIT_STATE, type ToolEditState } from "@/app/(app)/tools/action-state"

/**
 * Editing one tool. `name` is absent on purpose — it is what a driver reads off
 * the label, and nothing in this app identifies a tool any other way.
 *
 * Type and condition are always editable; location, floor, holder and the
 * release switch are gated on `editability`. **The disabled inputs are a
 * courtesy, not the guard** — `updateToolAction` recomputes the same
 * `editabilityOf` against a fresh read before it writes, because a server
 * action is reachable by direct POST and because the claim can change while
 * this page sits open.
 *
 * `condition` seeds to `""` — "leave it alone" — whenever the live value isn't
 * one the select can represent (blank, or a legacy value the old Bubble UI
 * wrote). It shows as the placeholder so it stays visible.
 */
export function ToolDetailForm({
  tool,
  editability,
  toolTypes,
  locations,
}: {
  tool: ToolDetail
  editability: ToolEditability
  toolTypes: ToolType[]
  locations: string[]
}) {
  const [state, setState] = React.useState<ToolEditState>(INITIAL_TOOL_EDIT_STATE)
  const [pending, startTransition] = React.useTransition()

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ToolEditFormValues>({
    resolver: zodResolver(toolEditSchema),
    defaultValues: {
      toolId: tool.id,
      typeId: tool.typeId ?? "",
      condition: isSelectableCondition(tool.condition) ? tool.condition : "",
      location: tool.location,
      floor: tool.floor,
      currentUser: tool.currentUser,
      markAvailable: false,
    },
  })

  const releasing = useWatch({ control, name: "markAvailable" })

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateToolAction(values)
      if (result.status === "invalid") {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          setError(key as keyof ToolEditFormValues, { type: "server", message })
        }
      }
      setState(result)
      if (result.status !== "saved") return

      // Re-seed from what was actually written so the form stops reading dirty
      // and the release switch springs back. The page revalidates underneath.
      reset({
        ...values,
        markAvailable: false,
        currentUser: values.markAvailable ? "" : values.currentUser,
      })
      toast.add({ title: `${result.name} saved`, description: result.warning ?? "Your changes have been saved." })
    })
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup className="sm:grid sm:grid-cols-2 sm:gap-x-6">
        <ToolCatalogueFields control={control} toolTypes={toolTypes} currentCondition={tool.condition} />

        <FieldSeparator className="sm:col-span-2" />

        <ToolMovementFields
          control={control}
          locations={locations}
          disabled={!editability.movable}
          releasing={releasing}
          error={errors.location?.message}
        />

        {editability.canRelease && <ToolReleaseField control={control} />}

        {state.status === "error" && <FieldError className="sm:col-span-2">{state.message}</FieldError>}

        <Field orientation="horizontal" className="justify-end sm:col-span-2">
          <Button type="submit" disabled={pending || !isDirty}>
            {pending ? <Spinner /> : <SaveIcon />}
            Save changes
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}

function isSelectableCondition(value: string): value is (typeof TOOL_CONDITION)[number] {
  return (TOOL_CONDITION as readonly string[]).includes(value)
}
