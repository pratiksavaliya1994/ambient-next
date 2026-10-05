import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PickupRequestForm } from "@/components/pickup-request-form"
import { buttonVariants } from "@/components/ui/button"
import { listMaterialItems } from "@/lib/bubble/material-items"
import { listFieldPms, listJobs, listTimeSlots } from "@/lib/bubble/reference"
import { toJobOption } from "@/lib/bubble/reference-types"

export const metadata: Metadata = { title: "New pickup request" }

export default async function NewPickupRequestPage() {
  // Unlike Delivery, this doesn't load `listToolTypes` — pickup picks
  // individual tools already at the job (see `lib/bubble/pickup-tools.ts`),
  // fetched live once a job is chosen, not the `toolstype` catalogue. The
  // material catalogue is read fresh rather than memoised, as on the delivery
  // form: the picker only offers active items.
  const [jobs, fieldPms, timeSlots, materialItems] = await Promise.all([
    listJobs(),
    listFieldPms(),
    listTimeSlots(),
    listMaterialItems(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-medium">New pickup request</h1>
          <p className="text-sm text-muted-foreground">Enter details for a tool and material pickup.</p>
        </div>
        <Link
          href="/requests"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          <ArrowLeftIcon />
          Back to requests
        </Link>
      </div>

      <PickupRequestForm
        jobs={jobs.map(toJobOption)}
        fieldPms={fieldPms}
        timeSlots={timeSlots}
        materialItems={materialItems}
      />
    </div>
  )
}
