import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { CombinedRequestForm } from "@/components/combined-request-form"
import { buttonVariants } from "@/components/ui/button"
import { listMaterialItems } from "@/lib/bubble/material-items"
import { listFieldPms, listJobs, listToolTypes } from "@/lib/bubble/reference"
import { toJobOption } from "@/lib/bubble/reference-types"

export const metadata: Metadata = { title: "New delivery + pickup request" }

export default async function NewCombinedRequestPage() {
  // The union of what the two single-purpose pages load: the `toolstype`
  // catalogue for the delivery half, the material catalogue both halves pick
  // from, and everything shared. The pickup half's physical `tools` are fetched
  // live once a job is chosen, not from here. All but the material catalogue
  // are memoised in `reference.ts`; that one is read fresh because the picker
  // shows its stock.
  const [jobs, toolTypes, fieldPms, materialItems] = await Promise.all([
    listJobs(),
    listToolTypes(),
    listFieldPms(),
    listMaterialItems(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-medium">New delivery + pickup request</h1>
          <p className="text-sm text-muted-foreground">
            Fill the shared details once. Submitting creates two separate requests.
          </p>
        </div>
        <Link
          href="/requests"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          <ArrowLeftIcon />
          Back to requests
        </Link>
      </div>

      <CombinedRequestForm
        jobs={jobs.map(toJobOption)}
        toolTypes={toolTypes}
        fieldPms={fieldPms}
        materialItems={materialItems}
      />
    </div>
  )
}
