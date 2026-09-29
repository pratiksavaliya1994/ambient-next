import { PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { MaterialsCatalogue } from "@/components/materials-catalogue"
import { MaterialsCatalogueSkeleton } from "@/components/materials-skeletons"
import { MaterialsViewSwitch } from "@/components/materials-view-switch"
import { buttonVariants } from "@/components/ui/button"
import { listMaterialItems } from "@/lib/bubble/material-items"

export const metadata: Metadata = { title: "Materials" }

/**
 * The material catalogue with its stock.
 *
 * One read of the whole `materialitem` table, retired rows included — the
 * catalogue is small, so search, category and the "show retired" toggle all
 * filter in the browser rather than costing a round trip each. Never memoised:
 * stock is what changes between visits (see `material-items.ts`).
 */
export default function MaterialsPage() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h1 className="text-lg font-medium">Materials</h1>
          <p className="text-xs text-muted-foreground">The warehouse&rsquo;s stock — what a delivery can ask for.</p>
        </div>
        <Link href="/materials/new" className={buttonVariants({ size: "sm" })}>
          <PlusIcon />
          Add material
        </Link>
      </div>

      <MaterialsViewSwitch active="warehouse" />

      <Suspense fallback={<MaterialsCatalogueSkeleton />}>
        <MaterialsList />
      </Suspense>
    </div>
  )
}

async function MaterialsList() {
  const items = await listMaterialItems({ includeInactive: true })
  return <MaterialsCatalogue items={items} />
}
