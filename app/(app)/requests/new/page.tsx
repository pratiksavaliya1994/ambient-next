import type { Metadata } from "next"

import { RequestForm } from "@/components/request-form"
import {
  listFieldPms,
  listJobs,
  listTimeSlots,
  listToolTypes,
} from "@/lib/bubble/reference"
import { toJobOption } from "@/lib/bubble/reference-types"
import { notificationsEnabled } from "@/lib/notify"

export const metadata: Metadata = { title: "New tool request" }

export default async function NewRequestPage() {
  // Four independent lookups, so fetch them together rather than in sequence.
  // All four are memoised in `reference.ts`, so this is usually free.
  const [jobs, toolTypes, fieldPms, timeSlots] = await Promise.all([
    listJobs(),
    listToolTypes(),
    listFieldPms(),
    listTimeSlots(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-medium">New tool request</h1>
        <p className="text-sm text-muted-foreground">
          Nothing is written to Bubble until you submit.
        </p>
      </div>

      <RequestForm
        jobs={jobs.map(toJobOption)}
        toolTypes={toolTypes}
        fieldPms={fieldPms}
        timeSlots={timeSlots}
        notificationsOn={notificationsEnabled()}
      />
    </div>
  )
}
