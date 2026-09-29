"use client"

import { XIcon } from "lucide-react"

import { MaterialLineRow } from "@/components/material-line-row"
import { Button } from "@/components/ui/button"
import { ItemGroup } from "@/components/ui/item"
import { toLineDisplay } from "@/lib/materials/line-inputs"
import type { MaterialLineInput } from "@/lib/schemas/material"

/** A non-inventory line never looks up the catalogue, so no items are needed. */
const NO_ITEMS = new Map()

/**
 * The other items already on the request, shown under the "Other item" form so
 * the picker says what it has added — the lines field behind the dialog is
 * covered while it's open. Removing drops the line by its index in `lines`.
 */
export function MaterialOtherLinesList({
  lines,
  onChange,
}: {
  lines: MaterialLineInput[]
  onChange: (next: MaterialLineInput[]) => void
}) {
  const others = lines.flatMap((line, index) => (line.kind === "NonInventory" ? [{ line, index }] : []))
  if (others.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Added ({others.length})
      </span>
      <ItemGroup className="scrollbar-slim -mx-1 max-h-[30svh] gap-1 overflow-y-auto px-1">
        {others.map(({ line, index }) => {
          const display = toLineDisplay(line, NO_ITEMS)
          return (
            <MaterialLineRow
              key={`other-${index}`}
              line={display}
              className="border-transparent bg-muted/50"
              actions={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${display.name}`}
                  onClick={() => onChange(lines.filter((_, at) => at !== index))}
                >
                  <XIcon className="text-destructive" />
                </Button>
              }
            />
          )
        })}
      </ItemGroup>
    </div>
  )
}
