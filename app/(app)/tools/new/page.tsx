import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { ToolCreateForm } from "@/components/tool-create-form"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WAREHOUSE_JOB_NAMES } from "@/lib/bubble/enums"
import { listJobs, listToolTypes } from "@/lib/bubble/reference"

export const metadata: Metadata = { title: "Add Tool" }

/**
 * Bringing a new physical tool into the `tools` table — the counterpart to
 * `/tools/[toolId]`, which repairs one that already exists.
 *
 * Two memoised reference reads and nothing else. There is no hold to check and
 * no history to show: a tool that doesn't exist can't be on a trip, reserved
 * by a request, or have been anywhere. The one lookup this page *can't* do up
 * front is the name check — that needs the name — so it lives in the form as a
 * server action.
 *
 * The location list is the same one the detail page builds, minus its own
 * tool's current value: every `jobs.name` plus the warehouse stand-ins. A new
 * tool defaults to the warehouse but isn't forced there, because tools do get
 * bought and delivered straight to a site.
 */
export default async function NewToolPage() {
  const [toolTypes, jobs] = await Promise.all([listToolTypes(), listJobs()])

  const locations = [...new Set([...WAREHOUSE_JOB_NAMES, ...jobs.map((job) => job.name)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium">Add a tool</h1>
          <p className="text-sm text-muted-foreground">
            One physical unit, not a catalogue entry — give it the name that&rsquo;s on its label.
          </p>
        </div>
        <Link
          href="/tools/all"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          <ArrowLeftIcon />
          Back to tools
        </Link>
      </div>

      <Card data-size="sm">
        <CardHeader>
          <CardTitle className="text-base">New tool</CardTitle>
          <span className="text-sm text-muted-foreground">
            It starts Available at the warehouse, held by nobody. You can move it from its own page afterwards.
          </span>
        </CardHeader>
        <CardContent>
          <ToolCreateForm toolTypes={toolTypes} locations={locations} />
        </CardContent>
      </Card>
    </div>
  )
}
