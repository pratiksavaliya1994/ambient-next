"use client"

import { PlusIcon } from "lucide-react"

import { MaterialDialog } from "@/components/material-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

/**
 * The materials block — a label, a Clear button, the "Add material" popup and
 * the text itself — as one component.
 *
 * It lives in `components/` rather than inside a form because the combined
 * Delivery + Pickup page renders **two** of them (materials wanted on site and
 * materials wanted off it are different lists, and become different
 * `requestedmaterials` rows). The two single-purpose forms still inline their
 * own copy; this is the shared one, and adopting it there is a tidy-up, not a
 * requirement.
 */
export function MaterialsField({
  value,
  defaultText,
  onChange,
  label = "Materials",
  emptyText = "No materials added.",
}: {
  value: string
  /** Seeds the popup the first time it opens while the field is empty — `defaultMaterialsFor(toDo)`. */
  defaultText: string
  onChange: (next: string) => void
  label?: string
  emptyText?: string
}) {
  return (
    <Field>
      <div className="flex items-center justify-between py-2">
        <FieldLabel>{label}</FieldLabel>
        <div className="flex items-center gap-2">
          {value.trim() && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              Clear
            </Button>
          )}
          <MaterialDialog
            value={value}
            defaultText={defaultText}
            onChange={onChange}
            trigger={
              <Button type="button" variant="outline" size="sm">
                <PlusIcon data-icon="inline-start" />
                Add material
              </Button>
            }
          />
        </div>
      </div>
      {value.trim() ? (
        <pre className="min-h-32 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
          {value}
        </pre>
      ) : (
        <FieldDescription>{emptyText}</FieldDescription>
      )}
    </Field>
  )
}
