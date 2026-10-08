"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isWarehouseLocation } from "@/lib/bubble/enums"
import { TOOL_CONDITION, type ToolCondition } from "@/lib/bubble/tool-enums"

const KEEP_CONDITION = "__keep__"

/**
 * Where you are, plus the two optional fields applied to every tool in the
 * batch. The location is picked, never typed — it is written byte for byte
 * into `tools.location`, which has to equal a `jobs.name`.
 */
export function StockTakeSetup({
  locations,
  location,
  onLocationChange,
  floor,
  onFloorChange,
  condition,
  onConditionChange,
}: {
  locations: string[]
  location: string
  onLocationChange: (next: string) => void
  floor: string
  onFloorChange: (next: string) => void
  condition: ToolCondition | ""
  onConditionChange: (next: ToolCondition | "") => void
}) {
  const atWarehouse = location !== "" && isWarehouseLocation(location)
  const conditionItems = [
    { label: "Leave as is", value: KEEP_CONDITION },
    ...TOOL_CONDITION.map((value) => ({ label: value, value })),
  ]

  return (
    <FieldGroup className="gap-y-4 sm:grid sm:grid-cols-2 sm:gap-x-6">
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="stock-take-location">Where are you counting?</FieldLabel>
        <Combobox
          items={locations}
          value={location || null}
          onValueChange={(next) => onLocationChange((next as string | null) ?? "")}
          limit={40}
        >
          <ComboboxInput id="stock-take-location" placeholder="Search jobs and warehouses" />
          <ComboboxContent>
            <ComboboxEmpty>No job or warehouse matches.</ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>

      {!atWarehouse && (
        <Field>
          <FieldLabel htmlFor="stock-take-floor">Floor</FieldLabel>
          <Input
            id="stock-take-floor"
            placeholder="14, ground, Suite 139"
            value={floor}
            onChange={(event) => onFloorChange(event.target.value)}
          />
          <FieldDescription>Applied to every tool you save. Leave blank if unknown.</FieldDescription>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="stock-take-condition">Condition</FieldLabel>
        <Select
          items={conditionItems}
          value={condition || KEEP_CONDITION}
          onValueChange={(next) => onConditionChange(next === KEEP_CONDITION || !next ? "" : (next as ToolCondition))}
        >
          <SelectTrigger id="stock-take-condition">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {conditionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  )
}
