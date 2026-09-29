import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * An item's stock as one pill — `12 bag` — in destructive red at or below zero.
 *
 * Zero and negative share the red on purpose: stock can read negative (two
 * managers taking the last units at once — Known limits in
 * `phase-5-materials.md`), and either way there is nothing on the shelf.
 */
export function MaterialStockBadge({
  stockQty,
  unit,
  prefix,
  className,
}: {
  stockQty: number
  unit: string
  /** Leading words, e.g. "In stock", where the badge sits without a label. */
  prefix?: string
  className?: string
}) {
  const empty = stockQty <= 0

  return (
    <Badge
      variant="outline"
      className={cn("tabular-nums", empty && "border-transparent bg-destructive/15 text-destructive", className)}
    >
      {prefix && `${prefix} `}
      {stockQty} {unit}
    </Badge>
  )
}
