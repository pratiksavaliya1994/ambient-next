import "server-only"

import { z } from "zod"

import { bubbleListMaybeMissing, type BubbleThing, type Constraint } from "@/lib/bubble/client"
import { STOCK_HISTORY, toStockHistoryEntry } from "@/lib/bubble/material-items"
import type { StockHistoryEntry } from "@/lib/bubble/material-items-types"
import { listJobs } from "@/lib/bubble/reference"
import type { SiteStockRow } from "@/lib/bubble/site-stock-types"

/**
 * Reading site stock (`materialsitestock`) and a site's audit trail (the
 * `materialstockhistory` rows carrying its `location`).
 *
 * **Read-only.** The only writer is `adjust-site-stock`, inside Bubble, and it
 * is never exposed. **Never memoised**, for the reason `material-items.ts`
 * isn't: this is exactly what changes between visits.
 *
 * `bubbleListMaybeMissing` rather than `bubbleListAll`: the type is new, and a
 * 404 before it exists should read as "nothing delivered yet", not as an error.
 */

const SITE_STOCK = "materialsitestock"

const siteStockRow = z.looseObject({
  _id: z.string(),
  "Modified Date": z.string().optional(),
  materialID: z.string().optional(),
  materialName: z.string().optional(),
  unit: z.string().optional(),
  location: z.string().optional(),
  qty: z.number().optional(),
})

function toSiteStockRow(raw: BubbleThing): SiteStockRow | null {
  const row = siteStockRow.parse(raw)
  if (!row.materialID || !row.location) return null
  return {
    id: row._id,
    materialId: row.materialID,
    materialName: row.materialName?.trim() ?? "",
    unit: row.unit?.trim() ?? "",
    location: row.location,
    qty: row.qty ?? 0,
    modifiedAt: row["Modified Date"] ?? null,
  }
}

/**
 * Site stock rows, optionally narrowed to one site and/or some items. Raw
 * rows, duplicates and zeros included. `groupBySite` shapes
 * them for a screen.
 */
export async function listSiteStock({
  location,
  materialIds,
}: { location?: string; materialIds?: readonly string[] } = {}): Promise<SiteStockRow[]> {
  if (materialIds && materialIds.length === 0) return []

  const constraints: Constraint[] = []
  if (location) constraints.push({ key: "location", constraint_type: "equals", value: location })
  if (materialIds) constraints.push({ key: "materialID", constraint_type: "in", value: [...new Set(materialIds)] })

  const wanted = materialIds ? new Set(materialIds) : null
  return (await bubbleListMaybeMissing(SITE_STOCK, { constraints }))
    .map(toSiteStockRow)
    .filter(
      (row): row is SiteStockRow =>
        row !== null && (!location || row.location === location) && (!wanted || wanted.has(row.materialId))
    )
}

/**
 * `location → jobs._id` for these site names, off the memoised jobs list, so a
 * site link carries the job's id and never its name. A location matching no
 * job (a typo `check-bubble` would flag) is simply absent, and renders unlinked.
 */
export async function siteJobIds(locations: Iterable<string>): Promise<Map<string, string>> {
  const wanted = new Set(locations)
  if (wanted.size === 0) return new Map()
  const jobs = await listJobs()
  return new Map(jobs.filter((job) => wanted.has(job.name)).map((job) => [job.name, job.id]))
}

/** Every stock change at one site, newest first — `Deliver` rows now, `Collect` rows from 5F. */
export async function listSiteHistory(location: string): Promise<StockHistoryEntry[]> {
  const rows = await bubbleListMaybeMissing(STOCK_HISTORY, {
    constraints: [{ key: "location", constraint_type: "equals", value: location }],
    sortField: "Created Date",
    descending: true,
  })
  return rows.map(toStockHistoryEntry).filter((entry) => entry.location === location)
}
