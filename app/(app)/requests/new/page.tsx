import type { Metadata } from "next"

import { RequestForm } from "@/components/request-form"
import {
  listFieldPms,
  listJobs,
  listMaterialDefaults,
  listTimeSlots,
  listToolTypes,
} from "@/lib/bubble/reference"
import { toJobOption } from "@/lib/bubble/reference-types"

export const metadata: Metadata = { title: "New tool request" }

export default async function NewRequestPage() {
  // Five independent lookups, so fetch them together rather than in sequence.
  // All five are memoised in `reference.ts`, so this is usually free.
  const [jobs, toolTypes, fieldPms, timeSlots, materialDefaults] =
    await Promise.all([
      listJobs(),
      listToolTypes(),
      listFieldPms(),
      listTimeSlots(),
      listMaterialDefaults(),
    ])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-medium">New tool request</h1>
        <p className="text-sm text-muted-foreground">
          Enter details for a new tool request.
        </p>
      </div>

      <RequestForm
        jobs={jobs.map(toJobOption)}
        toolTypes={toolTypes}
        fieldPms={fieldPms}
        timeSlots={timeSlots}
        materialDefaults={materialDefaults}
      />
    </div>
  )
}
