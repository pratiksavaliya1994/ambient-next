"use client"

import { MapPinIcon, SearchIcon } from "lucide-react"
import * as React from "react"

import { MaterialStockBadge } from "@/components/material-stock-badge"
import { QuantityStepper } from "@/components/quantity-stepper"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import type { SiteStockHint } from "@/hooks/use-site-stock-hint"
import { inventoryQtyOf, setInventoryQty } from "@/lib/materials/line-inputs"
import type { MaterialLineInput } from "@/lib/schemas/material"

/**
 * The picker's "From inventory" tab. Two modes:
 *
 * - **delivery** — the catalogue narrowed to the job type, each item with its
 *   warehouse stock as a guide.
 * - **pickup** (5G) — every active item, the picked job's site items **first**,
 *   each with "Delivered, not picked up" and a **Take all** that sets the
 *   estimate to that figure. Warehouse stock isn't shown: it says nothing
 *   about what's on a site, and invites being read as a limit.
 */
export function MaterialInventoryList({
  offered,
  placeholder,
  lines,
  onChange,
  site,
}: {
  /** Already narrowed and ordered for the mode. */
  offered: MaterialItem[]
  placeholder: string
  lines: MaterialLineInput[]
  onChange: (next: MaterialLineInput[]) => void
  /** Pickup only: the site hint. Absent on a delivery. */
  site?: { hint: SiteStockHint; qtyById: ReadonlyMap<string, number> }
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
          placeholder={placeholder}
          autoFocus
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      {site?.hint.pending && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          Checking what this site has been sent…
        </p>
      )}

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No materials match</EmptyTitle>
            <EmptyDescription>Try another search, or add it as an other item.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="scrollbar-slim -mx-1 max-h-[50svh] gap-1 overflow-y-auto px-1">
          {visible.map((item) => (
            <InventoryItem
              key={item.id}
              item={item}
              quantity={inventoryQtyOf(lines, item.id)}
              onSite={site ? (site.qtyById.get(item.id) ?? null) : undefined}
              onChange={(next) => onChange(setInventoryQty(lines, item.id, next))}
            />
          ))}
        </ItemGroup>
      )}
    </>
  )
}

/**
 * One catalogue item. `onSite` is `undefined` on a delivery (show warehouse
 * stock), `null` on a pickup when the site has none of it, else the figure.
 */
function InventoryItem({
  item,
  quantity,
  onSite,
  onChange,
}: {
  item: MaterialItem
  quantity: number
  onSite: number | null | undefined
  onChange: (next: number) => void
}) {
  const unit = item.unit ? ` ${item.unit}` : ""

  return (
    <Item size="sm" variant={quantity > 0 ? "muted" : "default"}>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-2 w-full">{item.name}</ItemTitle>
        <ItemDescription className="flex flex-wrap items-center gap-1.5">
          {onSite === undefined && <MaterialStockBadge stockQty={item.stockQty} unit={item.unit} prefix="In stock:" />}
          {typeof onSite === "number" && (
            <span className="inline-flex items-center gap-1 text-xs text-foreground tabular-nums">
              <MapPinIcon className="size-3 text-muted-foreground" />
              Delivered, not picked up: {onSite}
              {unit}
            </span>
          )}
          {item.category && <span className="text-xs">{item.category}</span>}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap justify-end">
        {typeof onSite === "number" && (
          <Button type="button" variant="ghost" size="sm" disabled={quantity === onSite} onClick={() => onChange(onSite)}>
            Take all
          </Button>
        )}
        <QuantityStepper value={quantity} label={item.name} onChange={onChange} />
      </ItemActions>
    </Item>
  )
}
