import { ArrowLeftIcon, MapPinIcon, UserIcon, WrenchIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ToolDetailForm } from "@/components/tool-detail-form"
import { ToolHoldNotice, ToolOrphanNotice, ToolTripFlagNotice } from "@/components/tool-hold-notice"
import { ConditionBadge, StatusBadge } from "@/components/tool-status-badges"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WAREHOUSE_JOB_NAMES } from "@/lib/bubble/enums"
import { NO_LOCATION } from "@/lib/bubble/pickup-tools-types"
import { listJobs, listToolTypes } from "@/lib/bubble/reference"
import { getTool, readToolHold, readToolTripFlag } from "@/lib/bubble/tool-detail"
import { editabilityOf } from "@/lib/tools/tool-edit"

export const metadata: Metadata = { title: "Tool" }

/**
 * One tool, and the only screen in the app that edits one directly.
 *
 * Everywhere else a `tools` row changes as a *consequence* — of assigning, of
 * starting a trip, of recording a stop. That leaves no way to correct a row
 * that has drifted from reality, and no way at all to free a tool whose
 * `statusNew` claims a request or trip that no longer exists: `isFreeToAssign`
 * hides it from every picker, so it simply disappears from the app. This page
 * is that repair, and `lib/tools/tool-edit.ts` carries the reasoning for when
 * it will and won't let you.
 *
 * Five reads, three of them the five-minute-memoised reference lists. The two
 * that aren't — the claim lookups behind `readToolHold` — are the same ones
 * `assignToolsAction` runs, and they are the whole point of the screen.
 */
export default async function ToolDetailPage({ params }: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await params

  const tool = await getTool(toolId)
  if (!tool) notFound()

  const [hold, tripFlag, toolTypes, jobs] = await Promise.all([
    readToolHold(tool.id),
    readToolTripFlag(tool.id),
    listToolTypes(),
    listJobs(),
  ])

  const editability = editabilityOf(tool, hold)

  // The tool's own location is folded in even when it matches no job — a row
  // sitting at a string nobody recognises must still render its current value,
  // and `updateToolAction` lets an unchanged location through for that reason.
  const locations = [...new Set([...WAREHOUSE_JOB_NAMES, ...jobs.map((job) => job.name), tool.location])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-medium wrap-anywhere">{tool.name || "Unnamed tool"}</h1>
          <Link
            href="/tools/all"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
          >
            <ArrowLeftIcon />
            Back to tools
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={tool.status} />
          <ConditionBadge condition={tool.condition} />
          {tool.typeName && (
            <Badge variant="secondary">
              <WrenchIcon className="size-3.5" />
              {tool.typeName}
            </Badge>
          )}
          <Badge variant="outline">
            <MapPinIcon className="size-3.5" />
            {tool.location || NO_LOCATION}
            {tool.floor && ` · Floor ${tool.floor}`}
          </Badge>
          {tool.currentUser && (
            <Badge variant="outline">
              <UserIcon className="size-3.5" />
              {tool.currentUser}
            </Badge>
          )}
        </div>
      </div>

      {/* Order is deliberate: why it's locked beats why it's odd. A held tool
          can't be orphaned, so those two never both render. */}
      {hold && <ToolHoldNotice hold={hold} />}
      {editability.orphaned && <ToolOrphanNotice status={tool.status} />}
      {tripFlag && <ToolTripFlagNotice flag={tripFlag} />}

      <Card data-size="sm">
        <CardHeader>
          <CardTitle className="text-base">Edit</CardTitle>
          {!editability.movable && (
            <span className="text-sm text-muted-foreground">Only Type and Condition can be changed right now.</span>
          )}
        </CardHeader>
        <CardContent>
          <ToolDetailForm tool={tool} editability={editability} toolTypes={toolTypes} locations={locations} />
        </CardContent>
      </Card>
    </div>
  )
}
