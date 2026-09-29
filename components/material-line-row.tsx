import { BoxIcon, PackageIcon } from "lucide-react"
import type * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item"
import type { MaterialKind, MaterialLine } from "@/lib/bubble/requested-materials-types"
import type { MaterialLineDisplay } from "@/lib/materials/line-inputs"
import { cn } from "@/lib/utils"

/**
 * One material line, shared by the request form's list, the request page and
 * the assign card. Deliberately dumb: `meta` replaces the quantity text (the
 * request page says "12 of 20", the assign card "requested 20 · in stock 12")
 * and `actions` is whatever controls the screen wants on the right. With
 * neither, it's the read-only variant.
 *
 * No `"use client"` — the request page renders it on the server.
 */
export function MaterialLineRow({
  line,
  meta,
  actions,
  className,
}: {
  line: MaterialLineDisplay
  meta?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <Item size="sm" variant="outline" className={cn("bg-background", className)}>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-2 w-full wrap-anywhere">{line.name}</ItemTitle>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <MaterialKindBadge kind={line.kind} />
          {meta ?? <span className="tabular-nums">{quantityLabel(line)}</span>}
        </div>
      </ItemContent>
      {actions && <ItemActions className="flex-wrap justify-end">{actions}</ItemActions>}
    </Item>
  )
}

/** "Stock" for a catalogue item, "Other" for a free-text one — the one fact that decides how a line is assigned. */
export function MaterialKindBadge({ kind, className }: { kind: MaterialKind; className?: string }) {
  return kind === "Inventory" ? (
    <Badge variant="secondary" className={className}>
      <PackageIcon />
      Stock
    </Badge>
  ) : (
    <Badge variant="outline" className={className}>
      <BoxIcon />
      Other
    </Badge>
  )
}

/** `5 bag`, or "One lot" for a line asked for without a quantity. */
export function quantityLabel(line: Pick<MaterialLine, "quantity" | "unit">): string {
  if (line.quantity === null) return "One lot"
  return [line.quantity, line.unit?.trim()].filter(Boolean).join(" ")
}
