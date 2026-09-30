"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeftIcon, PlusIcon, SaveIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form"

import { MaterialItemFields } from "@/components/material-item-fields"
import { MaterialNameField, useMaterialNameCheck } from "@/components/material-name-field"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import {
  materialItemCreateSchema,
  materialItemEditSchema,
  type MaterialItemCreateValues,
  type MaterialItemEditValues,
} from "@/lib/schemas/material"
import { createMaterialItemAction, updateMaterialItemAction } from "@/app/(app)/materials/actions"

/**
 * Adding a catalogue item. Stock starts at 0 in Bubble whatever this says;
 * `openingStock` is received afterwards through the audited workflow, so the
 * first history row is a `Receive` like any other (see
 * `createMaterialItemAction`).
 */
export function MaterialItemCreateForm() {
  const router = useRouter()
  const [message, setMessage] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const form = useForm<MaterialItemCreateValues>({
    resolver: zodResolver(materialItemCreateSchema),
    defaultValues: {
      name: "",
      unit: "",
      category: "",
      warehouseLocation: "",
      relatedTo: [],
      notes: "",
      openingStock: 0,
    },
  })
  const { check, setCheck } = useMaterialNameCheck(useWatch({ control: form.control, name: "name" }) ?? "")

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await createMaterialItemAction(values)
      if (result.status === "invalid") {
        for (const [key, text] of Object.entries(result.fieldErrors)) {
          form.setError(key as keyof MaterialItemCreateValues, { type: "server", message: text })
        }
      }
      setMessage(result.status === "error" || result.status === "invalid" ? result.message : null)
      if (result.status !== "created") return

      toast.add({ title: `${result.name} added`, description: result.warning ?? "It's in the catalogue." })
      router.push(`/materials/${result.itemId}`)
    })
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-y-4 sm:grid sm:grid-cols-2 sm:gap-x-6">
          <MaterialNameField check={check} onCheckChange={setCheck} />
          <MaterialItemFields>
            <Field data-invalid={form.formState.errors.openingStock ? true : undefined}>
              <FieldLabel htmlFor="openingStock">Opening stock</FieldLabel>
              <Input
                id="openingStock"
                type="number"
                inputMode="numeric"
                min={0}
                {...form.register("openingStock", { setValueAs: (value) => (value === "" ? 0 : Number(value)) })}
              />
              <FieldDescription>How many are on the shelf now. Recorded as the first stock receipt.</FieldDescription>
              {form.formState.errors.openingStock && <FieldError>{form.formState.errors.openingStock.message}</FieldError>}
            </Field>
          </MaterialItemFields>

          {message && <FieldError className="sm:col-span-2">{message}</FieldError>}

          <FormButtons
            cancelHref="/materials"
            pending={pending}
            disabled={check.status === "taken"}
            icon={<PlusIcon />}
          >
            Add material
          </FormButtons>
        </FieldGroup>
      </form>
    </FormProvider>
  )
}

/**
 * Editing an item's catalogue fields, and retiring or restoring it. **Stock is
 * not here** — it only moves through the adjust dialog, so every change to it
 * is audited. Neither is the name: it's fixed once created, and the page
 * heading shows it.
 */
export function MaterialItemEditForm({ item }: { item: MaterialItem }) {
  const [message, setMessage] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const form = useForm<MaterialItemEditValues>({
    resolver: zodResolver(materialItemEditSchema),
    defaultValues: {
      itemId: item.id,
      unit: item.unit,
      category: item.category ?? "",
      warehouseLocation: item.warehouseLocation ?? "",
      relatedTo: item.relatedTo,
      notes: item.notes ?? "",
      active: item.active,
    },
  })
  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateMaterialItemAction(values)
      if (result.status === "invalid") {
        for (const [key, text] of Object.entries(result.fieldErrors)) {
          form.setError(key as keyof MaterialItemEditValues, { type: "server", message: text })
        }
      }
      setMessage(result.status === "error" || result.status === "invalid" ? result.message : null)
      if (result.status !== "saved") return

      // Re-seed from what was written so the form stops reading dirty; the page revalidates underneath.
      form.reset(values)
      toast.add({ title: `${result.name} saved`, description: "Your changes have been saved." })
    })
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-y-4 sm:grid sm:grid-cols-2 sm:gap-x-6">
          <MaterialItemFields>
            <Field orientation="horizontal" className="sm:col-span-2">
              <Controller
                control={form.control}
                name="active"
                render={({ field }) => (
                  <Switch id="active" checked={field.value} onCheckedChange={(next) => field.onChange(next === true)} />
                )}
              />
              <FieldLabel htmlFor="active">Active — offered on new requests</FieldLabel>
            </Field>
          </MaterialItemFields>

          {message && <FieldError className="sm:col-span-2">{message}</FieldError>}

          <FormButtons
            cancelHref="/materials"
            pending={pending}
            disabled={!form.formState.isDirty}
            icon={<SaveIcon />}
          >
            Save changes
          </FormButtons>
        </FieldGroup>
      </form>
    </FormProvider>
  )
}

/**
 * Back and submit. Submit is blocked on a *confirmed* name clash only — a probe
 * that failed or hasn't finished leaves it live, because the action re-checks.
 */
function FormButtons({
  cancelHref,
  pending,
  disabled,
  icon,
  children,
}: {
  cancelHref: string
  pending: boolean
  disabled: boolean
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Field orientation="horizontal" className="justify-end gap-2 sm:col-span-2">
      <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
        <ArrowLeftIcon />
        Back
      </Link>
      <Button type="submit" disabled={pending || disabled}>
        {pending ? <Spinner /> : icon}
        {children}
      </Button>
    </Field>
  )
}
