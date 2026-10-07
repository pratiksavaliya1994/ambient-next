"use client"

import * as React from "react"

import { MaterialInventoryList } from "@/components/material-inventory-list"
import { MaterialOtherItemForm } from "@/components/material-other-item-form"
import { MaterialOtherLinesList } from "@/components/material-other-lines-list"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import type { SiteStockHint } from "@/hooks/use-site-stock-hint"
import { itemsFor, type MaterialItem } from "@/lib/bubble/material-items-types"
import type { ToDo } from "@/lib/bubble/enums"
import type { MaterialLineInput } from "@/lib/schemas/material"

/** A delivery asks for material to go out; a pickup estimates what comes back. */
export type MaterialLinesMode = "delivery" | "pickup"

/**
 * Adding material lines: **From inventory** (the catalogue) or **Other item**
 * (free text). Edits the lines live, the way the tool picker edits its
 * selection — nothing reaches Bubble until the request is submitted, so
 * there's no draft to commit or discard.
 *
 * - **Delivery:** the catalogue narrowed to the job type, stock shown and
 *   **not enforced** — assignment is where the warehouse decides.
 * - **Pickup (5G):** every active item, the job's site figure as a hint and
 *   never a limit. Quantities are estimates; the driver counts at the stop.
 */
export function MaterialPickerDialog({
  items,
  toDo,
  lines,
  onChange,
  trigger,
  mode = "delivery",
  site,
}: {
  items: MaterialItem[]
  toDo: ToDo
  lines: MaterialLineInput[]
  onChange: (next: MaterialLineInput[]) => void
  trigger: React.ReactElement
  mode?: MaterialLinesMode
  /** Pickup only: what the picked job has been sent and not sent back. */
  site?: SiteStockHint
}) {
  const pickup = mode === "pickup"
  const qtyById = React.useMemo(
    () => new Map((site?.items ?? []).map((entry) => [entry.materialId, entry.qty])),
    [site?.items]
  )
  const offered = React.useMemo(() => {
    if (!pickup) return itemsFor(items, toDo)
    // The site's items first, then everything else, each half in catalogue order.
    return [...items].sort((a, b) => Number(qtyById.has(b.id)) - Number(qtyById.has(a.id)))
  }, [pickup, items, toDo, qtyById])
  const placeholder = pickup
    ? `Search ${items.length} materials`
    : `Search ${offered.length} of ${items.length} offered for ${toDo || "all job types"}`

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pickup ? "Add materials to collect" : "Add materials"}</DialogTitle>
          <DialogDescription>
            {pickup
              ? "Quantities are estimates — the driver counts what actually comes back."
              : "Stock is shown as a guide — the warehouse decides what goes out when it assigns."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="inventory" className="min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="inventory">From inventory</TabsTrigger>
            <TabsTrigger value="other">Other item</TabsTrigger>
          </TabsList>
          <TabsContent value="inventory" className="flex min-h-0 flex-col gap-3">
            <MaterialInventoryList
              offered={offered}
              placeholder={placeholder}
              lines={lines}
              onChange={onChange}
              site={pickup && site ? { hint: site, qtyById } : undefined}
            />
          </TabsContent>
          <TabsContent value="other" className="flex min-h-0 flex-col gap-4">
            <MaterialOtherItemForm
              mode={mode}
              onAdd={(line) => {
                onChange([...lines, line])
                toast.add({ title: "Item added", description: line.kind === "NonInventory" ? line.name : undefined })
              }}
            />
            <MaterialOtherLinesList lines={lines} onChange={onChange} />
          </TabsContent>
        </Tabs>

        <DialogFooter className="sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {lines.length} {lines.length === 1 ? "line" : "lines"} on the request
          </p>
          <DialogClose render={<Button type="button" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
