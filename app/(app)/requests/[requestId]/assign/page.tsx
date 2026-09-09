import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AssignToolsPanel } from "@/components/assign-tools-panel"
import { RequestStatusBadge } from "@/components/request-status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { listAssignedTools, listCandidateTools, listTakenToolIds, listToolsByIds } from "@/lib/bubble/assigned-tools"
import { buildSlots, type CandidateTool, type Conflict } from "@/lib/bubble/assigned-tools-types"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { listToolTypes } from "@/lib/bubble/reference"
import { getRequest } from "@/lib/bubble/requests"

export const metadata: Metadata = { title: "Assign tools" }

/**
 * Picking the physical `tools` rows that go on the truck for one request.
 *
 * **One route for the whole lifecycle**, branching on `request.status` —
 * dispatch (2B) lands here rather than on a third page, because it reads the
 * same expensive dataset.
 *
 * That dataset is the point: `bubbleListAll` paginates sequentially and retries
 * on 429, so the reads below are slower than the `Promise.all` makes them look.
 * The body streams under `<Suspense>` behind the header, the same way
 * `/requests` and `/tools` do.
 */
export default async function AssignPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex justify-end">
        <Link
          href={`/requests/${requestId}`}
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          <ArrowLeftIcon />
          Back to request
        </Link>
      </div>

      <Suspense fallback={<AssignSkeleton />}>
        <AssignBody requestId={requestId} />
      </Suspense>
    </div>
  )
}

async function AssignBody({ requestId }: { requestId: string }) {
  const request = await getRequest(requestId)
  if (!request) notFound()

  // `toolstype` is memoised for five minutes and effectively free; the
  // `assignedtools` read is one `in` query on a child table. Both are needed
  // before the candidate query, since the slots are what name the types.
  const [assigned, toolTypes] = await Promise.all([listAssignedTools([request.id]), listToolTypes()])
  const { slots, extraToolIds } = buildSlots(request.tools, assigned, toolTypes)

  const typeIds = slots
    .filter((slot) => !slot.consumable && slot.typeId)
    .map((slot) => slot.typeId as string)

  const [candidates, conflicts, alreadyAssigned] = await Promise.all([
    listCandidateTools([...new Set(typeIds)]),
    listTakenToolIds(request),
    // Extras, and slot fills whose tool the candidate query wouldn't return
    // (a renamed type, a blank `tools.type`) — resolved by id so every
    // assigned tool has a name on screen.
    listToolsByIds([...new Set([...extraToolIds, ...slots.flatMap((slot) => slot.toolIds)])]),
  ])

  // One pool, keyed by id: the candidates for the requested types plus
  // whatever is already on the request. The panel adds to it as extras are
  // searched for.
  const pool = new Map<string, CandidateTool>()
  for (const tool of [...candidates, ...alreadyAssigned]) pool.set(tool.id, tool)

  const conflictsByTool: Record<string, Conflict> = {}
  for (const [toolId, conflict] of conflicts) conflictsByTool[toolId] = conflict

  const unresolved = slots.filter((slot) => !slot.consumable && !slot.typeId).length

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-medium wrap-anywhere">{request.job}</h1>
          <RequestStatusBadge status={request.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {newYorkDayLabel(request.start ?? request.end)}
          {request.end && request.start !== request.end && ` → ${newYorkDayLabel(request.end)}`}
          {request.timeRange && ` · ${request.timeRange}`}
          {request.fieldPm && ` · ${request.fieldPm}`}
        </p>
      </div>

      {/* Notes beside the picker rather than above it: `order` puts them in the
          right-hand column from `lg` up, where they stay in view while the slot
          list scrolls, and above the picker when the columns collapse. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-18 lg:order-2">
          <Card data-size="sm">
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Note label="Request notes">{request.notes}</Note>
              <Note label="Tool notes">{request.toolsNotes}</Note>
            </CardContent>
          </Card>
        </aside>

        <div className="min-w-0 lg:order-1">
          <AssignToolsPanel
            requestId={request.id}
            slots={slots}
            extraToolIds={extraToolIds}
            pool={[...pool.values()]}
            conflicts={conflictsByTool}
            unresolvedSlots={unresolved}
          />
        </div>
      </div>
    </>
  )
}

/**
 * The request's free text, beside the picker rather than left on the detail
 * page: it routinely names the specific tool, a substitution to avoid, or a
 * floor the driver needs — information the slots themselves don't carry.
 *
 * Rendered even when empty, so "no note" reads as a checked fact rather than a
 * card that might not have loaded.
 */
function Note({ label, children }: { label: string; children: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <p className="text-sm wrap-anywhere whitespace-pre-line text-muted-foreground">{children || "—"}</p>
    </div>
  )
}

function AssignSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Skeleton className="h-32 w-full rounded-xl lg:order-2" />
        <div className="flex min-w-0 flex-col gap-4 lg:order-1">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
