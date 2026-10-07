import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { RequestForm } from "@/components/request-form"
import { buttonVariants } from "@/components/ui/button"
import { listMaterialItems } from "@/lib/bubble/material-items"
import { listFieldPms, listJobs, listToolTypes } from "@/lib/bubble/reference"
import { toJobOption } from "@/lib/bubble/reference-types"

export const metadata: Metadata = { title: "New delivery request" }

export default async function NewRequestPage() {
  // Four independent lookups, so fetch them together rather than in sequence.
  // The first three are memoised in `reference.ts`; the material catalogue is
  // read fresh every time, because the picker shows its stock.
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
          <h1 className="text-xl font-medium">New delivery request</h1>
          <p className="text-sm text-muted-foreground">Enter details for a new tool request.</p>
        </div>
        <Link
          href="/requests"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          <ArrowLeftIcon />
          Back to requests
        </Link>
      </div>

      <RequestForm
        jobs={jobs.map(toJobOption)}
        toolTypes={toolTypes}
        fieldPms={fieldPms}
        materialItems={materialItems}
      />
    </div>
  )
}
