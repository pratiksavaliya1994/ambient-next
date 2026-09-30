"use client"

import { type Control } from "react-hook-form"

import { ToolConditionField, ToolTypeField } from "@/components/tool-fields"
import { WarehouseLocationField } from "@/components/warehouse-location-field"
import type { ToolType } from "@/lib/bubble/reference-types"
import type { ToolEditFormValues } from "@/lib/schemas/tool"

/**
 * The ungated half of the tool detail form: what the tool *is*, as opposed to
 * where it is. Neither field is affected by a trip or a request holding the
 * tool, so neither is ever disabled.
 *
 * The widgets themselves moved to `tool-fields.tsx` when the Add tool form
 * needed the same two; this stays as the pairing the edit form renders, so
 * `ToolDetailForm` keeps one import and stays inside `CLAUDE.md`'s 100-line
 * component ceiling.
 *
 * **Type is editable even while the tool is claimed**: a request's slots match
 * on the `toolType` string recorded at assign time, never on the live
 * `tools.type` link, so changing it can't reshuffle an assignment.
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
      <ToolTypeField control={control} name="typeId" toolTypes={toolTypes} />
      <ToolConditionField control={control} name="condition" placeholder={currentCondition || "Not set"} />
      <WarehouseLocationField control={control} name="warehouseLocation" className="sm:col-span-2" />
    </>
  )
}
