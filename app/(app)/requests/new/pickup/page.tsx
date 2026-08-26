import type { Metadata } from "next"
import Link from "next/link"

import { PickupRequestForm } from "@/components/pickup-request-form"
import { listFieldPms, listJobs, listMaterialDefaults, listTimeSlots } from "@/lib/bubble/reference"
import { toJobOption } from "@/lib/bubble/reference-types"

export const metadata: Metadata = { title: "New pickup request" }

export default async function NewPickupRequestPage() {
  // Unlike Delivery, this doesn't load `listToolTypes` — pickup picks
  // individual tools already at the job (see `lib/bubble/pickup-tools.ts`),
  // fetched live once a job is chosen, not the `toolstype` catalogue.
  const [jobs, fieldPms, timeSlots, materialDefaults] = await Promise.all([
    listJobs(),
    listFieldPms(),
    listTimeSlots(),
    listMaterialDefaults(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-medium">New pickup request</h1>
          <p className="text-sm text-muted-foreground">Enter details for a tool pickup.</p>
        </div>
        <Link href="/requests/new" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Delivery instead?
        </Link>
      </div>

      <PickupRequestForm
        jobs={jobs.map(toJobOption)}
        fieldPms={fieldPms}
        timeSlots={timeSlots}
        materialDefaults={materialDefaults}
      />
    </div>
  )
}
