import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"

import type { AssignMaterialsData } from "@/components/assign-materials-panel"
import { AssignToolsPanel } from "@/components/assign-tools-panel"
import { RequestStatusBadge } from "@/components/request-status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  listAssignedTools,
  listCandidateTools,
  listRequestClaims,
  listToolsByIds,
} from "@/lib/bubble/assigned-tools"
import {
  buildSlots,
  type CandidateTool,
  type ToolRequestClaim,
  type ToolTripClaim,
} from "@/lib/bubble/assigned-tools-types"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { isOpenRequest, isPickupRequest } from "@/lib/bubble/enums"
import { listMaterialItemsByIds } from "@/lib/bubble/material-items"
import { listLinkedPickupLines, listTransferSources } from "@/lib/bubble/material-transfers"
import { listToolTypes } from "@/lib/bubble/reference"
import { lineProgress } from "@/lib/bubble/requested-materials-types"
import { getRequest, type ToolRequest } from "@/lib/bubble/requests"
import { listTripMaterialsForLines } from "@/lib/bubble/tripmaterial-read"
import { listToolClaims } from "@/lib/bubble/trips-read"

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
  // A pickup names its tools when it's created and its material lines need no
  // approval, so there is nothing to assign — the request page is the place.
  if (isPickupRequest(request)) redirect(`/requests/${request.id}`)

  const header = (
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
  )

  // `toolstype` is memoised for five minutes and effectively free; the
  // `assignedtools` read is one `in` query on a child table. Both are needed
  // before the candidate query, since the slots are what name the types.
  const [assigned, toolTypes] = await Promise.all([listAssignedTools([request.id]), listToolTypes()])
  const { slots, extraToolIds } = buildSlots(request.tools, assigned, toolTypes)

  const typeIds = slots
    .filter((slot) => !slot.consumable && slot.typeId)
    .map((slot) => slot.typeId as string)

  // Every tool currently on the request — what both lock checks are asked about.
  const assignedIds = [...new Set([...extraToolIds, ...slots.flatMap((slot) => slot.toolIds)])]

  const [candidates, alreadyAssigned, claims, materials] = await Promise.all([
    listCandidateTools([...new Set(typeIds)]),
    // Extras, and slot fills whose tool the candidate query wouldn't return
    // (a renamed type, a blank `tools.type`) — resolved by id so every
    // assigned tool has a name on screen.
    listToolsByIds(assignedIds),
    // Which of them a saved trip is already carrying. Not derivable from the
    // `tools` rows above: a trip claims its tools the moment it is saved and
    // `statusNew` doesn't say so until the driver collects them — see
    // `ToolTripClaim`. Without this the picker offers to unassign a tool a
    // driver is on their way to load.
    listToolClaims(assignedIds),
    request.materialLines.length > 0 ? loadMaterials(request) : null,
  ])

  // One pool, keyed by id: the candidates for the requested types plus
  // whatever is already on the request. The panel adds to it as extras are
  // searched for.
  const pool = new Map<string, CandidateTool>()
  for (const tool of [...candidates, ...alreadyAssigned]) pool.set(tool.id, tool)

  // Which of the offered tools another open request already holds. Sequential
  // rather than folded into the `Promise.all` above, because it takes the pool
  // as its input and the pool is what that call produces.
  //
  // Two reads for a warning is worth it: the alternative is a PM committing a
  // tool that a pickup is already bringing home, discovering it only when the
  // trip builder refuses to save, and having no idea which other request to go
  // and fix. `request.id` is excluded — this request's own rows are not a
  // conflict with itself.
  const requestClaims = await listRequestClaims([...pool.keys()], request.id)

  const unresolved = slots.filter((slot) => !slot.consumable && !slot.typeId).length

  const heldElsewhere: ToolRequestClaim[] = [...requestClaims.values()]

  const tripClaims: ToolTripClaim[] = [...claims].map(([toolId, trip]) => ({
    toolId,
    tripId: trip.id,
    driver: trip.driver,
    started: trip.status === "In Transit",
  }))

  return (
    <>
      {header}

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

        <div className="flex min-w-0 flex-col gap-6 lg:order-1">
          <AssignToolsPanel
            requestId={request.id}
            slots={slots}
            extraToolIds={extraToolIds}
            pool={[...pool.values()]}
            claims={tripClaims}
            requestClaims={heldElsewhere}
            unresolvedSlots={unresolved}
            materials={materials}
          />
        </div>
      </div>
    </>
  )
}

/**
 * The Materials card's reads: live stock for the lines' items, and the trip
 * rows that set each line's floor. Both fresh — stock is what the bounds are
 * about. Loaded with the tools because the two share one Save; a failure is
 * still the card's alone, handed down as an error rather than thrown, so it
 * never takes the tools panel down with it.
 *
 * Only a delivery gets here (a pickup redirects), so it also reads its
 * transfers (5F §2.6): the pickup lines already linked to its lines, whose
 * estimates come off each line's bound, and the pickup lines at other sites
 * that could be linked.
 */
async function loadMaterials(request: ToolRequest): Promise<AssignMaterialsData> {
  const lines = request.materialLines
  const lineIds = lines.map((line) => line.id)
  try {
    const [items, ownRows, linked, sources] = await Promise.all([
      listMaterialItemsByIds(lines.flatMap((line) => (line.materialId ? [line.materialId] : []))),
      listTripMaterialsForLines(lineIds),
      listLinkedPickupLines(lineIds),
      isOpenRequest(request.status) ? listTransferSources(request, lines) : [],
    ])
    const tripRows = [...ownRows, ...linked.tripRows]
    const progress = (line: (typeof lines)[number]) => lineProgress(line, tripRows, { linked: linked.lines })
    return {
      lines,
      stock: Object.fromEntries(items.map((item) => [item.id, item.stockQty])),
      shelves: Object.fromEntries(
        items.flatMap((item) => (item.warehouseLocation ? [[item.id, item.warehouseLocation]] : []))
      ),
      floors: Object.fromEntries(lines.map((line) => [line.id, progress(line).onTrips])),
      coverage: Object.fromEntries(lines.map((line) => [line.id, progress(line).linkedCoverage])),
      sources,
      pickup: request.pickup,
      readOnly: !isOpenRequest(request.status),
    }
  } catch (error) {
    return { lines, error: error instanceof Error ? error.message : "Bubble didn't answer." }
  }
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
