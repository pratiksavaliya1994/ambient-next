"use client"

import { PackageIcon, PlusIcon, XIcon } from "lucide-react"
import * as React from "react"

import { MaterialLineRow, quantityLabel } from "@/components/material-line-row"
import { MaterialPickerDialog, type MaterialLinesMode } from "@/components/material-picker-dialog"
import { QuantityStepper } from "@/components/quantity-stepper"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { ItemGroup } from "@/components/ui/item"
import type { SiteStockHint } from "@/hooks/use-site-stock-hint"
import type { ToDo } from "@/lib/bubble/enums"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import { setInventoryQty, toLineDisplay } from "@/lib/materials/line-inputs"
import type { MaterialLineInput } from "@/lib/schemas/material"

/**
 * The material lines on a request form: the chosen lines, each with its kind
 * and quantity, a remove control, and the "Add materials" picker. Every form
 * that carries materials uses it — delivery, pickup and both halves of the
 * combined page.
 *
 * `mode="pickup"` (5G): quantities read as estimates ("about 10 bag"), the
 * picker offers every active item with the site hint, and nothing is
 * pre-filled.
 *
 * Controlled — the form owns the array (`materialLines` /
 * `deliveryMaterialLines`) and this only proposes the next one.
 */
export function MaterialLinesField({
  lines,
  onChange,
  items,
  toDo,
  label = "Materials",
  error,
  mode = "delivery",
  site,
}: {
  lines: MaterialLineInput[]
  onChange: (next: MaterialLineInput[]) => void
  /** The active catalogue, read fresh by the page. */
  items: MaterialItem[]
  toDo: ToDo
  label?: string
  error?: string
  mode?: MaterialLinesMode
  /** Pickup only: the picked job's site figures, passed to the picker. */
  site?: SiteStockHint
}) {
  const pickup = mode === "pickup"
  const itemsById = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  return (
    <Field data-invalid={error ? true : undefined}>
      <div className="flex items-center justify-between gap-2 py-2">
        <FieldLabel>{label}</FieldLabel>
        <div className="flex items-center gap-2">
          {lines.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear
            </Button>
          )}
          <MaterialPickerDialog
            items={items}
            toDo={toDo}
            lines={lines}
            onChange={onChange}
            mode={mode}
            site={site}
            trigger={
              <Button type="button" variant="outline" size="sm">
                <PlusIcon data-icon="inline-start" />
                Add materials
              </Button>
            }
          />
        </div>
      </div>

      {lines.length === 0 ? (
        <NoLines pickup={pickup} />
      ) : (
        <ItemGroup className="scrollbar-slim max-h-88 gap-1 overflow-y-auto rounded-lg border p-1">
          {lines.map((line, index) => {
            const display = toLineDisplay(line, itemsById)
            return (
              <MaterialLineRow
                key={line.kind === "Inventory" ? line.materialId : `other-${index}`}
                line={display}
                meta={pickup && display.quantity !== null ? <span>about {quantityLabel(display)}</span> : undefined}
                className="border-transparent bg-muted/50"
                actions={
                  <>
                    {line.kind === "Inventory" && (
                      <QuantityStepper
                        value={line.quantity}
                        min={1}
                        label={display.name}
                        onChange={(next) => onChange(setInventoryQty(lines, line.materialId, next))}
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${display.name}`}
                      onClick={() => onChange(lines.filter((_, at) => at !== index))}
                    >
                      <XIcon className="text-destructive" />
                    </Button>
                  </>
                }
              />
            )
          })}
        </ItemGroup>
      )}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function NoLines({ pickup }: { pickup: boolean }) {
  return (
    <Empty className="border border-dashed py-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageIcon />
        </EmptyMedia>
        <EmptyTitle className="text-sm">No materials yet</EmptyTitle>
      </EmptyHeader>
      <EmptyDescription>
        {pickup
          ? "Add what’s on site to bring back."
          : "Pick from stock, or describe something the warehouse doesn’t carry."}
      </EmptyDescription>
    </Empty>
  )
}
