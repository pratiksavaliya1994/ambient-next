"use client"

import { SearchIcon } from "lucide-react"
import * as React from "react"

import { MaterialOtherItemForm } from "@/components/material-other-item-form"
import { MaterialOtherLinesList } from "@/components/material-other-lines-list"
import { MaterialStockBadge } from "@/components/material-stock-badge"
import { QuantityStepper } from "@/components/quantity-stepper"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { itemsFor, type MaterialItem } from "@/lib/bubble/material-items-types"
import type { ToDo } from "@/lib/bubble/enums"
import { inventoryQtyOf, setInventoryQty } from "@/lib/materials/line-inputs"
import type { MaterialLineInput } from "@/lib/schemas/material"

/**
 * Adding material lines: **From inventory** (the catalogue, narrowed to the job
 * type) or **Other item** (free text). Edits the lines live, the way the tool
 * picker edits its selection — nothing reaches Bubble until the request is
 * submitted, so there's no draft to commit or discard.
 *
 * Stock is shown and **not enforced**: a request is a wish, and assignment is
 * where the warehouse decides what it can send.
 */
export function MaterialPickerDialog({
  items,
  toDo,
  lines,
  onChange,
  trigger,
}: {
  items: MaterialItem[]
  toDo: ToDo
  lines: MaterialLineInput[]
  onChange: (next: MaterialLineInput[]) => void
  trigger: React.ReactElement
}) {
  const offered = React.useMemo(() => itemsFor(items, toDo), [items, toDo])

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add materials</DialogTitle>
          <DialogDescription>
            Stock is shown as a guide — the warehouse decides what goes out when it assigns.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="inventory" className="min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="inventory">From inventory</TabsTrigger>
            <TabsTrigger value="other">Other item</TabsTrigger>
          </TabsList>
          <TabsContent value="inventory" className="flex min-h-0 flex-col gap-3">
            <InventoryList offered={offered} catalogueSize={items.length} toDo={toDo} lines={lines} onChange={onChange} />
          </TabsContent>
          <TabsContent value="other" className="flex min-h-0 flex-col gap-4">
            <MaterialOtherItemForm
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

function InventoryList({
  offered,
  catalogueSize,
  toDo,
  lines,
  onChange,
}: {
  offered: MaterialItem[]
  catalogueSize: number
  toDo: ToDo
  lines: MaterialLineInput[]
  onChange: (next: MaterialLineInput[]) => void
}) {
  const [query, setQuery] = React.useState("")
  const needle = query.trim().toLowerCase()
  const visible = needle ? offered.filter((item) => item.name.toLowerCase().includes(needle)) : offered

  return (
    <>
      <InputGroup>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${offered.length} of ${catalogueSize} offered for ${toDo}`}
          autoFocus
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No materials match</EmptyTitle>
            <EmptyDescription>Try another search, switch the job type, or add it as an other item.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="scrollbar-slim -mx-1 max-h-[50svh] gap-1 overflow-y-auto px-1">
          {visible.map((item) => {
            const quantity = inventoryQtyOf(lines, item.id)
            return (
              <Item key={item.id} size="sm" variant={quantity > 0 ? "muted" : "default"}>
                <ItemContent className="min-w-0">
                  <ItemTitle className="line-clamp-2 w-full">{item.name}</ItemTitle>
                  <ItemDescription className="flex flex-wrap items-center gap-1.5">
                    <MaterialStockBadge stockQty={item.stockQty} unit={item.unit} prefix="In stock:" />
                    {item.category && <span className="text-xs">{item.category}</span>}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <QuantityStepper
                    value={quantity}
                    label={item.name}
                    onChange={(next) => onChange(setInventoryQty(lines, item.id, next))}
                  />
                </ItemActions>
              </Item>
            )
          })}
        </ItemGroup>
      )}
    </>
  )
}
