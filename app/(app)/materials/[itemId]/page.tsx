import type { Metadata } from "next"
import { Suspense } from "react"

import { MaterialDetailHeader, MaterialEditSection } from "@/components/material-detail-sections"
import { MaterialHistoryPanel } from "@/components/material-history-panel"
import { MaterialHistorySkeleton } from "@/components/materials-skeletons"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getMaterialItem } from "@/lib/bubble/material-items"

export const metadata: Metadata = { title: "Material" }

/**
 * One catalogue item: its stock and how it got there, and its catalogue fields.
 *
 * Nothing is awaited up front: the item read starts here and is shared by the
 * header and the edit form, while the history column runs its own read, each
 * behind its own Suspense boundary so the slower one never holds up the other.
 * The history is paged, 25 rows at a time. There is no per-site breakdown —
 * an item can sit on hundreds of sites, so that lives on each site's page.
 *
 * Laid out like `/tools/[toolId]`: the catalogue form on the left and the audit
 * trail on the right, sticky and scrolling on its own so a long history doesn't
 * push the form off screen. Adjusting stock — why most people open this page —
 * is the header action, in a dialog.
 */
export default async function MaterialDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const item = getMaterialItem(itemId)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Suspense fallback={<HeaderSkeleton />}>
        <MaterialDetailHeader item={item} />
      </Suspense>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card data-size="sm">
          <CardHeader>
            <CardTitle className="text-base">Edit</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-80 w-full" />}>
              <MaterialEditSection item={item} />
            </Suspense>
          </CardContent>
        </Card>

        <Card data-size="sm" className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
            <span className="text-sm text-muted-foreground">Every change to this item&rsquo;s stock, newest first.</span>
          </CardHeader>
          <CardContent className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<MaterialHistorySkeleton />}>
              <MaterialHistoryPanel itemId={itemId} item={item} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-64" />
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-28" />
      </div>
    </div>
  )
}
