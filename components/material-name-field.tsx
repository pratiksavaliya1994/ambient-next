"use client"

import { CheckIcon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { Controller, useFormContext } from "react-hook-form"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { MaterialItemFormValues } from "@/lib/schemas/material"
import { checkMaterialNameAction } from "@/app/(app)/materials/actions"
import { INITIAL_MATERIAL_NAME_CHECK, type MaterialNameCheck } from "@/app/(app)/materials/action-state"

/** Long enough that ordinary typing doesn't fire a round trip per character. */
const DEBOUNCE_MS = 450

/**
 * The probe's verdict, and the verdict **as it applies to what is typed now**:
 * a result about a name the input has since moved past reads as idle, so a
 * stale "free" can't sit under a different name.
 */
export function useMaterialNameCheck(name: string) {
  const [raw, setCheck] = React.useState<MaterialNameCheck>(INITIAL_MATERIAL_NAME_CHECK)
  const check = raw.status !== "idle" && raw.name !== name.trim() ? INITIAL_MATERIAL_NAME_CHECK : raw
  return { check, setCheck }
}

/**
 * The item's name, and the live check that no other item wears it —
 * `ToolNameField`'s recipe: debounced while typing, immediate on blur, and
 * `token` discards a verdict that lost the race to a newer one. No `useEffect`;
 * the probe starts from the handlers.
 *
 * **Advice, not the gate** — the create and edit actions re-run the lookup
 * before writing. Reads the form through `useFormContext` so the create and
 * edit forms, whose value shapes differ, can both host it.
 */
export function MaterialNameField({
  check,
  onCheckChange,
  exceptId,
}: {
  check: MaterialNameCheck
  onCheckChange: (next: MaterialNameCheck) => void
  /** The item being edited, which may keep its own name. */
  exceptId?: string
}) {
  const { control, formState } = useFormContext<MaterialItemFormValues>()
  const error = formState.errors.name?.message
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const token = React.useRef(0)

  function probe(raw: string, delay: number) {
    if (timer.current) clearTimeout(timer.current)
    const name = raw.trim()
    const mine = ++token.current
    if (name === "") return onCheckChange({ status: "idle" })

    onCheckChange({ status: "checking", name })
    timer.current = setTimeout(async () => {
      const result = await checkMaterialNameAction({ name, exceptId })
      if (token.current === mine) onCheckChange(result)
    }, delay)
  }

  return (
    <Field className="sm:col-span-2" data-invalid={error || check.status === "taken" ? true : undefined}>
      <FieldLabel htmlFor="name">Name</FieldLabel>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            id="name"
            placeholder="Thinset mortar, 6x6 welded wire"
            autoComplete="off"
            {...field}
            aria-invalid={error || check.status === "taken" ? true : undefined}
            onChange={(event) => {
              field.onChange(event)
              probe(event.target.value, DEBOUNCE_MS)
            }}
            onBlur={(event) => {
              field.onBlur()
              if (check.status === "idle" || check.name !== event.target.value.trim()) probe(event.target.value, 0)
            }}
          />
        )}
      />
      {error ? <FieldError>{error}</FieldError> : <NameVerdict check={check} />}
    </Field>
  )
}

/** `unknown` says nothing: the lookup failed, the save is still allowed, and the action decides. */
function NameVerdict({ check }: { check: MaterialNameCheck }) {
  if (check.status === "checking") {
    return (
      <FieldDescription className="flex items-center gap-1.5">
        <Spinner className="size-3.5" />
        Checking that name…
      </FieldDescription>
    )
  }

  if (check.status === "taken") {
    return (
      <FieldError className="flex flex-wrap items-center gap-1.5">
        <TriangleAlertIcon className="size-3.5 shrink-0" />
        <span>&ldquo;{check.existingName}&rdquo; already exists.</span>
        <Link href={`/materials/${check.itemId}`} className="underline underline-offset-2">
          Open it
        </Link>
      </FieldError>
    )
  }

  if (check.status === "available") {
    return (
      <FieldDescription className="flex items-center gap-1.5 text-status-ok-foreground">
        <CheckIcon className="size-3.5" />
        That name is free.
      </FieldDescription>
    )
  }

  return <FieldDescription>What a PM searches for and the warehouse reads off the request.</FieldDescription>
}
