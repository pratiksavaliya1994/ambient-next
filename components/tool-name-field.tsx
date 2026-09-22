"use client"

import { CheckIcon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { Controller, type Control } from "react-hook-form"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { ToolCreateFormValues } from "@/lib/schemas/tool"
import { checkToolNameAction } from "@/app/(app)/tools/new/actions"
import type { ToolNameCheck } from "@/app/(app)/tools/action-state"

/** Long enough that ordinary typing doesn't fire a round trip per character. */
const DEBOUNCE_MS = 450

/**
 * The tool's name, and the live check that nobody has used it already.
 *
 * `tools.name` has no uniqueness constraint in Bubble and two pairs of live
 * rows already collide case-insensitively, so this is a UI-side guard over a
 * database that will happily take a third. It runs on a debounce while typing
 * **and** immediately on blur — the blur is what catches someone who types a
 * name and tabs straight to Type faster than the timer.
 *
 * **It is advice, not the gate.** `createToolAction` re-runs the same lookup
 * before writing: this verdict is as old as the last keystroke, and a name can
 * be taken in another tab while the form sits open.
 *
 * No `useEffect` — the probe is started from the change and blur handlers,
 * which is where it belongs. `token` discards a verdict that lost the race
 * against a newer one, and the caller compares `check.name` with what is
 * currently typed so a stale result can't be shown against a name it was never
 * about.
 */
export function ToolNameField({
  control,
  check,
  onCheckChange,
  error,
}: {
  control: Control<ToolCreateFormValues>
  check: ToolNameCheck
  onCheckChange: (next: ToolNameCheck) => void
  error?: string
}) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const token = React.useRef(0)

  function probe(raw: string, delay: number) {
    if (timer.current) clearTimeout(timer.current)

    const name = raw.trim()
    if (name === "") {
      token.current++
      onCheckChange({ status: "idle" })
      return
    }

    const mine = ++token.current
    onCheckChange({ status: "checking", name })

    timer.current = setTimeout(async () => {
      const result = await checkToolNameAction({ name })
      // A slower earlier probe must not overwrite a newer verdict.
      if (token.current === mine) onCheckChange(result)
    }, delay)
  }

  return (
    <Field className="sm:col-span-2">
      <FieldLabel htmlFor="name">Name</FieldLabel>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            id="name"
            placeholder="S26 #9, Pumpjack #14 Blue"
            autoComplete="off"
            {...field}
            aria-invalid={error || check.status === "taken" ? true : undefined}
            onChange={(event) => {
              field.onChange(event)
              probe(event.target.value, DEBOUNCE_MS)
            }}
            onBlur={(event) => {
              field.onBlur()
              // Only worth re-probing if we haven't already settled on this
              // exact name — otherwise every tab-out costs a round trip.
              if (check.status === "idle" || check.name !== event.target.value.trim()) {
                probe(event.target.value, 0)
              }
            }}
          />
        )}
      />
      {error ? <FieldError>{error}</FieldError> : <ToolNameVerdict check={check} />}
    </Field>
  )
}

/**
 * What the probe found, in the field's description slot. `unknown` says
 * nothing: the lookup failed, the save is still allowed, and
 * `createToolAction` will have the final word either way.
 */
function ToolNameVerdict({ check }: { check: ToolNameCheck }) {
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
        <Link href={`/tools/${check.toolId}`} className="underline underline-offset-2">
          Open it
        </Link>
      </FieldError>
    )
  }

  if (check.status === "available") {
    return (
      <FieldDescription className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
        <CheckIcon className="size-3.5" />
        That name is free.
      </FieldDescription>
    )
  }

  return <FieldDescription>However the tool is labelled — this is what a driver reads off it.</FieldDescription>
}
