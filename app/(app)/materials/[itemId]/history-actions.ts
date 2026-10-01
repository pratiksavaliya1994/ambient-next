"use server"

import { z } from "zod"

import { requireSession } from "@/lib/auth/session"
import { listStockHistoryPage } from "@/lib/bubble/material-items"
import type { StockHistoryPage } from "@/lib/bubble/material-items-types"
import { siteJobIds } from "@/lib/bubble/site-stock"

const historyPageInput = z.object({ itemId: z.string().min(1), cursor: z.number().int().min(0) })

/** A page of history plus the site links it needs — a plain record, since it crosses to the browser. */
export type StockHistoryPageWithLinks = StockHistoryPage & { siteLinks: Record<string, string> }

export async function loadStockHistoryPage(input: unknown): Promise<StockHistoryPageWithLinks> {
  await requireSession()

  const { itemId, cursor } = historyPageInput.parse(input)
  const page = await listStockHistoryPage(itemId, cursor)
  const siteLinks = await siteJobIds(page.entries.map((entry) => entry.location))
  return { ...page, siteLinks: Object.fromEntries(siteLinks) }
}
