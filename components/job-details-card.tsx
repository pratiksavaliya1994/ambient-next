import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Job } from "@/lib/bubble/reference-types"

/**
 * Read-only `jobs` fields for `/sites/[jobId]`. Nothing here is editable —
 * the schema is Bubble's and this app doesn't own job records, only the
 * tools and materials moving through them.
 */
export function JobDetailsCard({ job }: { job: Job }) {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Borough", value: job.borough },
    { label: "Name", value: job.name },
    { label: "Detail", value: job.details },
    { label: "Location", value: job.location },
    { label: "Ongoing", value: job.ongoing === null ? null : job.ongoing ? "Yes" : "No" },
  ].filter((row) => row.value)

  return (
    <Card data-size="sm">
      <CardHeader>
        <CardTitle className="text-base">Job details</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other details are on file for this job.</p>
        ) : (
          <dl className="flex flex-col gap-3">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="wrap-anywhere whitespace-pre-line">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
