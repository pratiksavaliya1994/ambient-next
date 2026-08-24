import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PlusIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { newYorkLabel } from "@/lib/bubble/dates"
import { listRecentRequests, type ToolRequest } from "@/lib/bubble/requests"

export const metadata: Metadata = { title: "Tool requests" }

export default function RequestsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">Recent requests</h1>
          <p className="text-sm text-muted-foreground">
            Live from Bubble, newest first. Tool lines come from each
            request&rsquo;s requestedtools row.
          </p>
        </div>
        <Button render={<Link href="/requests/new" />} nativeButton={false}>
          <PlusIcon data-icon="inline-start" />
          New request
        </Button>
      </div>

      {/* Bubble needs two round trips for this and is not fast; stream it. */}
      <Suspense fallback={<RequestListSkeleton />}>
        <RequestList />
      </Suspense>
    </div>
  )
}

async function RequestList() {
  const requests = await listRecentRequests(25)

  if (requests.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No requests yet</EmptyTitle>
          <EmptyDescription>
            Create one and it will appear here and in the Bubble calendar.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href="/requests/new" />} nativeButton={false}>
            New request
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </div>
  )
}

function RequestCard({ request }: { request: ToolRequest }) {
  const movement = [request.delivery && "Delivery", request.pickup && "Pickup"]
    .filter(Boolean)
    .join(" + ")

  return (
    <Card>
      <CardHeader>
        <CardTitle>{request.job}</CardTitle>
        <CardDescription>
          {[
            newYorkLabel(request.start),
            request.timeRange,
            request.floor && `Floor ${request.floor}`,
            request.fieldPm,
          ]
            .filter(Boolean)
            .join(" · ")}
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {movement && <Badge variant="secondary">{movement}</Badge>}
          {request.toDo && <Badge variant="outline">{request.toDo}</Badge>}
          {request.weAre && <Badge variant="outline">{request.weAre}</Badge>}
          {request.tentative && <Badge variant="outline">Tentative</Badge>}
          {request.completed && <Badge>Completed</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {request.tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tools listed.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {request.tools.map((tool) => (
              <li key={tool.name} className="flex justify-between gap-4">
                <span className="min-w-0 truncate">{tool.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  &times; {tool.quantity}
                </span>
              </li>
            ))}
          </ul>
        )}

        {(request.contact || request.notes || request.toolsNotes) && (
          <div className="flex flex-col gap-1 border-t pt-3 text-sm text-muted-foreground">
            {request.contact && (
              <p>
                Contact: {request.contact}
                {request.contactPhone ? ` · ${request.contactPhone}` : ""}
              </p>
            )}
            {request.notes && (
              <p className="whitespace-pre-line">{request.notes}</p>
            )}
            {request.toolsNotes && (
              <p className="whitespace-pre-line">
                Tool notes: {request.toolsNotes}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RequestListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-44 w-full rounded-xl" />
      ))}
    </div>
  )
}
