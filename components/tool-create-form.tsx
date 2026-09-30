"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeftIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { ToolConditionField, ToolLocationField, ToolTypeField } from "@/components/tool-fields"
import { ToolNameField } from "@/components/tool-name-field"
import { ToolPhotoStaging, type StagedPhoto } from "@/components/tool-photo-staging"
import { WarehouseLocationField } from "@/components/warehouse-location-field"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { DEFAULT_WAREHOUSE } from "@/lib/bubble/enums"
import type { ToolType } from "@/lib/bubble/reference-types"
import { DEFAULT_TOOL_CONDITION } from "@/lib/bubble/tool-enums"
import { toolCreateSchema, type ToolCreateFormValues } from "@/lib/schemas/tool"
import { createToolAction } from "@/app/(app)/tools/new/actions"
import {
  INITIAL_TOOL_CREATE_STATE,
  INITIAL_TOOL_NAME_CHECK,
  type ToolCreateState,
  type ToolNameCheck,
} from "@/app/(app)/tools/action-state"

/**
 * Adding a physical tool.
 *
 * The defaults are the whole point of the shape of this form: a new tool is at
 * the warehouse, in one piece, and nobody has it. So `location` seeds to
 * `DEFAULT_WAREHOUSE` and `condition` to `Ok`, both still changeable; `status`
 * is not a field at all — `createTool` writes `Available` because that is the
 * only thing a tool with no `assignedtools` or `triptool` row behind it can
 * be — and there is no holder field, for the same reason.
 *
 * Only `name` and `typeId` are genuinely the user's to supply, and only `name`
 * needs checking, which is why it gets a whole component to itself.
 */
export function ToolCreateForm({ toolTypes, locations }: { toolTypes: ToolType[]; locations: string[] }) {
  const router = useRouter()
  const [state, setState] = React.useState<ToolCreateState>(INITIAL_TOOL_CREATE_STATE)
  const [nameCheck, setNameCheck] = React.useState<ToolNameCheck>(INITIAL_TOOL_NAME_CHECK)
  const [photos, setPhotos] = React.useState<StagedPhoto[]>([])
  const [pending, startTransition] = React.useTransition()

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ToolCreateFormValues>({
    resolver: zodResolver(toolCreateSchema),
    defaultValues: {
      name: "",
      typeId: "",
      location: DEFAULT_WAREHOUSE,
      floor: "",
      warehouseLocation: "",
      condition: DEFAULT_TOOL_CONDITION,
    },
  })

  // A verdict only counts against the name it was about — the input keeps
  // moving while the probe is in flight.
  const name = useWatch({ control, name: "name" }) ?? ""
  const check: ToolNameCheck =
    nameCheck.status !== "idle" && nameCheck.name !== name.trim() ? INITIAL_TOOL_NAME_CHECK : nameCheck

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createToolAction({ ...values, photos: photos.map((photo) => photo.file) })
      if (result.status === "invalid") {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          setError(key as keyof ToolCreateFormValues, { type: "server", message })
        }
      }
      setState(result)
      if (result.status !== "created") return

      toast.add({ title: `${result.name} added`, description: result.warning ?? "The tool is at the warehouse." })
      router.push(`/tools/${result.toolId}`)
    })
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup className="gap-y-4 sm:grid sm:grid-cols-2 sm:gap-x-6">
        <ToolNameField control={control} check={check} onCheckChange={setNameCheck} error={errors.name?.message} />

        <ToolTypeField control={control} name="typeId" toolTypes={toolTypes} error={errors.typeId?.message} />
        <ToolConditionField control={control} name="condition" />

        <ToolLocationField
          control={control}
          name="location"
          locations={locations}
          className="sm:col-span-2"
          error={errors.location?.message}
        />

        <Field>
          <FieldLabel htmlFor="floor">Floor</FieldLabel>
          <Controller
            control={control}
            name="floor"
            render={({ field }) => <Input id="floor" placeholder="14, ground, Suite 139" {...field} />}
          />
        </Field>

        <WarehouseLocationField control={control} name="warehouseLocation" error={errors.warehouseLocation?.message} />

        <FieldSeparator className="sm:col-span-2" />

        <Field className="sm:col-span-2">
          <FieldLabel>Photos</FieldLabel>
          <ToolPhotoStaging photos={photos} onChange={setPhotos} disabled={pending} />
        </Field>

        {state.status === "error" && <FieldError className="sm:col-span-2">{state.message}</FieldError>}

        <Field orientation="horizontal" className="justify-end gap-2 sm:col-span-2">
          <Link href="/tools/all" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeftIcon />
            Cancel
          </Link>
          {/* Blocked on a *confirmed* clash only. A probe that failed or hasn't
              finished leaves the button live — `createToolAction` re-checks. */}
          <Button type="submit" disabled={pending || check.status === "taken"}>
            {pending ? <Spinner /> : <PlusIcon />}
            Add tool
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
