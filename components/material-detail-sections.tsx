import { ArrowLeftIcon, TagIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { MaterialItemEditForm } from "@/components/material-item-form"
import { MaterialStockAdjustDialog } from "@/components/material-stock-adjust"
import { MaterialStockBadge } from "@/components/material-stock-badge"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import type { MaterialItem } from "@/lib/bubble/material-items-types"

type ItemPromise = { item: Promise<MaterialItem | null> }

/** Title, badges and the stock-adjust action. The section that 404s for an unknown id. */
export async function MaterialDetailHeader({ item: itemPromise }: ItemPromise) {
  const item = await itemPromise
  if (!item) notFound()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-xl font-medium wrap-anywhere">{item.name || "Unnamed material"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/materials"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
          >
            <ArrowLeftIcon />
            Back to materials
          </Link>
          <MaterialStockAdjustDialog item={item} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <MaterialStockBadge stockQty={item.stockQty} unit={item.unit} prefix="In stock:" />
        {item.category && (
          <Badge variant="secondary">
            <TagIcon />
            {item.category}
          </Badge>
        )}
        {!item.active && <Badge variant="outline">Retired</Badge>}
      </div>
    </div>
  )
}

/** The catalogue form. Renders nothing for an unknown id — the header owns the 404. */
export async function MaterialEditSection({ item: itemPromise }: ItemPromise) {
  const item = await itemPromise
  return item ? <MaterialItemEditForm item={item} /> : null
}
