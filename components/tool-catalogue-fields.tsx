"use client"

import { Controller, type Control } from "react-hook-form"

import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ToolType } from "@/lib/bubble/reference-types"
import { TOOL_CONDITION } from "@/lib/bubble/tool-enums"
import type { ToolEditFormValues } from "@/lib/schemas/tool"

/**
 * The ungated half of the tool detail form: what the tool *is*, as opposed to
 * where it is. Neither field is affected by a trip or a request holding the
 * tool, so neither is ever disabled.
 *
 * Split from `tool-detail-form.tsx` for `CLAUDE.md`'s 100-line ceiling, the
 * same way `tool-movement-fields.tsx` was.
 */
export function ToolCatalogueFields({
  control,
  toolTypes,
  currentCondition,
}: {
  control: Control<ToolEditFormValues>
  toolTypes: ToolType[]
  /** The raw live `condition`, shown as the placeholder when the select can't represent it. */
  currentCondition: string
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="typeId">Type</FieldLabel>
        <Controller
          control={control}
          name="typeId"
          render={({ field }) => (
            <Select
              items={toolTypes.map((type) => ({ label: type.name, value: type.id }))}
              value={field.value || null}
              onValueChange={(next) => field.onChange((next as string | null) ?? "")}
            >
              <SelectTrigger id="typeId">
                <SelectValue placeholder="No type set" />
              </SelectTrigger>
              <SelectContent className="max-w-(--available-width)">
                <SelectGroup>
                  {toolTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
        {/* Editable even while claimed: a request's slots match on the
            `toolType` string recorded at assign time, never on the live
            `tools.type` link, so this can't reshuffle an assignment. */}
      </Field>

      <Field>
        <FieldLabel htmlFor="condition">Condition</FieldLabel>
        <Controller
          control={control}
          name="condition"
          render={({ field }) => (
            <Select
              items={TOOL_CONDITION.map((value) => ({ label: value, value }))}
              value={field.value || null}
              onValueChange={(next) => field.onChange((next as string | null) ?? "")}
            >
              <SelectTrigger id="condition">
                <SelectValue placeholder={currentCondition || "Not set"} />
              </SelectTrigger>
              <SelectContent className="max-w-(--available-width)">
                <SelectGroup>
                  {TOOL_CONDITION.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
      </Field>
    </>
  )
}
