"use client"

import { useState, useTransition } from "react"

import { MaterialStockHistory } from "@/components/material-stock-history"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  loadStockHistoryPage,
  type StockHistoryPageWithLinks,
} from "@/app/(app)/materials/[itemId]/history-actions"

type Loaded = Pick<StockHistoryPageWithLinks, "entries" | "siteLinks" | "nextCursor">

/**
 * An item's history, one page at a time: the first page is server-rendered,
 * "Load older" appends the next. Rows are deduped on `id` because an offset
 * cursor shifts by one whenever stock moves between two loads.
 *
 * The parent keys this on the first page's newest row, so a stock change that
 * revalidates the page starts it over from page one instead of splicing.
 */
export function MaterialStockHistoryPaged({
  itemId,
  unit,
  initial,
}: {
  itemId: string
  unit: string
  initial: StockHistoryPageWithLinks
}) {
  const [loaded, setLoaded] = useState<Loaded>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const loadOlder = () => {
    if (loaded.nextCursor === null) return
    const cursor = loaded.nextCursor
    setError(null)
    startTransition(async () => {
      try {
        const page = await loadStockHistoryPage({ itemId, cursor })
        setLoaded((previous) => {
          const seen = new Set(previous.entries.map((entry) => entry.id))
          return {
            entries: [...previous.entries, ...page.entries.filter((entry) => !seen.has(entry.id))],
            siteLinks: { ...previous.siteLinks, ...page.siteLinks },
            nextCursor: page.nextCursor,
          }
        })
      } catch {
        setError("Couldn't load older changes. Try again.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <MaterialStockHistory entries={loaded.entries} unit={unit} siteLinks={new Map(Object.entries(loaded.siteLinks))} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loaded.nextCursor !== null && (
        <Button variant="outline" size="sm" className="self-center" onClick={loadOlder} disabled={pending}>
          {pending && <Spinner />}
          Load older
        </Button>
      )}
    </div>
  )
}
