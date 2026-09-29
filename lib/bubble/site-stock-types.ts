/**
 * Site stock — `materialsitestock` rows, one per catalogue item per job site —
 * and the pure maths the site views share.
 *
 * Client-safe, split from `site-stock.ts` for the reason every `*-types.ts`
 * here is. The qty means **delivered and not picked up**. Nobody tracks what
 * was used on site, so screens label it that way and never "on hand".
 *
 * Rows are written only by `adjust-site-stock`, inside Bubble. That workflow
 * can create two rows for one `(materialId, location)` when two first drops
 * race, so every reader here **adds duplicates up** rather than trusting there
 * is one.
 */

export type SiteStockRow = {
  id: string
  materialId: string
  materialName: string
  unit: string
  /** The job **name**, as `request.job` holds it. Never a warehouse. */
  location: string
  qty: number
  /** The row's `Modified Date` — when its qty last moved. */
  modifiedAt: string | null
}

/** One item at one site, duplicates summed. */
export type SiteItem = Omit<SiteStockRow, "id">

export type SiteGroup = {
  location: string
  items: SiteItem[]
  /** The newest movement among this site's items. */
  modifiedAt: string | null
}

const newest = (a: string | null, b: string | null) => ((a ?? "") >= (b ?? "") ? a : b)

/** Sums rows sharing `(materialId, location)` into one `SiteItem` each, drops `qty ≤ 0`, newest first. */
function sumRows(rows: readonly SiteStockRow[]): SiteItem[] {
  const byKey = new Map<string, SiteItem>()
  for (const row of rows) {
    const key = JSON.stringify([row.location, row.materialId])
    const seen = byKey.get(key)
    if (!seen) {
      byKey.set(key, {
        materialId: row.materialId,
        materialName: row.materialName,
        unit: row.unit,
        location: row.location,
        qty: row.qty,
        modifiedAt: row.modifiedAt,
      })
      continue
    }
    seen.qty += row.qty
    seen.modifiedAt = newest(seen.modifiedAt, row.modifiedAt)
  }
  return [...byKey.values()]
    .filter((item) => item.qty > 0)
    .sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? "") || a.materialName.localeCompare(b.materialName))
}

/** Per-site item lists, the site with the newest movement first. A site whose items all read ≤ 0 is left out. */
export function groupBySite(rows: readonly SiteStockRow[]): SiteGroup[] {
  const bySite = new Map<string, SiteItem[]>()
  for (const item of sumRows(rows)) bySite.set(item.location, [...(bySite.get(item.location) ?? []), item])

  return [...bySite.entries()]
    .map(([location, items]) => ({
      location,
      items,
      modifiedAt: items.reduce<string | null>((latest, item) => newest(latest, item.modifiedAt), null),
    }))
    .sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? "") || a.location.localeCompare(b.location))
}

/** Where one item is, site by site — the item page's "where it is" card. Duplicates summed, `qty ≤ 0` dropped. */
export function siteTotalsFor(rows: readonly SiteStockRow[], materialId: string): SiteItem[] {
  return sumRows(rows.filter((row) => row.materialId === materialId))
}
