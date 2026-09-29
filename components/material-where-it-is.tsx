import { MapPinIcon, WarehouseIcon } from "lucide-react"
import Link from "next/link"

import { MaterialStockBadge } from "@/components/material-stock-badge"
import type { SiteItem } from "@/lib/bubble/site-stock-types"

/**
 * Where one item is: the warehouse's `stockQty` first, then every job site
 * holding some, each linking to its site page.
 *
 * The site figures are **delivered, not picked up** — an upper bound, since
 * use on site isn't tracked — and the list says so rather than calling them
 * stock.
 */
export function MaterialWhereItIs({
  stockQty,
  unit,
  sites,
  siteLinks,
}: {
  stockQty: number
  unit: string
  /** From `siteTotalsFor`: duplicates summed, `qty ≤ 0` dropped. */
  sites: readonly SiteItem[]
  /** `location → jobs._id`. A site missing here renders unlinked. */
  siteLinks: ReadonlyMap<string, string>
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-lg border">
      <li className="flex items-center gap-2 px-3 py-2 text-sm">
        <WarehouseIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 font-medium">Warehouse</span>
        <MaterialStockBadge stockQty={stockQty} unit={unit} prefix="In stock:" />
      </li>

      {sites.map((site) => {
        const jobId = siteLinks.get(site.location)
        return (
          <li key={site.location} className="flex items-center gap-2 px-3 py-2 text-sm">
            <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
            {jobId ? (
              <Link
                href={`/materials/sites/${jobId}`}
                className="min-w-0 flex-1 truncate hover:underline"
                title={site.location}
              >
                {site.location}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate" title={site.location}>
                {site.location}
              </span>
            )}
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">
                {site.qty} {unit}
              </span>{" "}
              delivered, not picked up
            </span>
          </li>
        )
      })}

      {sites.length === 0 && (
        <li className="px-3 py-2 text-xs text-muted-foreground">Nothing delivered to a site is waiting to come back.</li>
      )}
    </ul>
  )
}
