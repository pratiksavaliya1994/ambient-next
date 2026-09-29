import { ArrowLeftIcon, TagIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { MaterialItemEditForm } from "@/components/material-item-form"
import { MaterialStockAdjustDialog } from "@/components/material-stock-adjust"
import { MaterialStockBadge } from "@/components/material-stock-badge"
import { MaterialStockHistory } from "@/components/material-stock-history"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MaterialWhereItIs } from "@/components/material-where-it-is"
import { getMaterialItem, listStockHistory } from "@/lib/bubble/material-items"
import { listSiteStock, siteJobIds } from "@/lib/bubble/site-stock"
import { siteTotalsFor } from "@/lib/bubble/site-stock-types"

export const metadata: Metadata = { title: "Material" }

/**
 * One catalogue item: its stock and how it got there, where it is (the
 * warehouse and every site holding some), and its catalogue fields.
 *
 * Three reads, all fresh, plus the memoised jobs list for the site links. Laid out like `/tools/[toolId]`: the catalogue form on
 * the left and the audit trail on the right, sticky and scrolling on its own so
 * a long history doesn't push the form off screen. Adjusting stock — why most
 * people open this page — is the header action, in a dialog.
 */
export default async function MaterialDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params

  const [item, history, siteRows] = await Promise.all([
    getMaterialItem(itemId),
    listStockHistory(itemId),
    listSiteStock({ materialIds: [itemId] }),
  ])
  if (!item) notFound()

  const sites = siteTotalsFor(siteRows, item.id)
  const siteLinks = await siteJobIds([...sites.map((site) => site.location), ...history.map((entry) => entry.location)])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Card data-size="sm">
            <CardHeader>
              <CardTitle className="text-base">Where it is</CardTitle>
            </CardHeader>
            <CardContent>
              <MaterialWhereItIs stockQty={item.stockQty} unit={item.unit} sites={sites} siteLinks={siteLinks} />
            </CardContent>
          </Card>

          <Card data-size="sm">
            <CardHeader>
              <CardTitle className="text-base">Edit</CardTitle>
            </CardHeader>
            <CardContent>
              <MaterialItemEditForm item={item} />
            </CardContent>
          </Card>
        </div>

        <Card data-size="sm" className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
            <span className="text-sm text-muted-foreground">Every change to this item&rsquo;s stock, newest first.</span>
          </CardHeader>
          <CardContent className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
            <MaterialStockHistory entries={history} unit={item.unit} siteLinks={siteLinks} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
