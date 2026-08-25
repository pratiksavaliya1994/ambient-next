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
  CardFooter,
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
import { newYorkRangeLabel } from "@/lib/bubble/dates"
import {
  hasContent,
  listRecentRequests,
  type ToolRequest,
} from "@/lib/bubble/requests"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Tool requests" }

/** Enough to fill three rows of the widest grid, and never fewer than ten. */
const VISIBLE_REQUESTS = 12

/**
 * How many rows to ask Bubble for to fill those twelve cards. Roughly half of
 * the most recently created rows are abandoned blanks (see `hasContent`), so a
 * window of exactly twelve is mostly empty cards. Four times over still fits in
 * one Bubble page, which caps at 100.
 */
const FETCH_MULTIPLE = 4

/**
 * `auto-fill` rather than a fixed column count: the cards keep a readable
 * floor of 21rem and a row simply holds fewer of them as the window narrows,
 * down to one on a phone. `min(…, 100%)` stops that floor from overflowing a
 * viewport narrower than a single card.
 */
const GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-6"

export default function RequestsPage() {
  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">Recent requests</h1>
          {/* <p className="text-sm text-muted-foreground">
            The {VISIBLE_REQUESTS} newest from Bubble. Tool lines come from each
            request&rsquo;s requestedtools row.
          </p> */}
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
  const recent = await listRecentRequests(VISIBLE_REQUESTS * FETCH_MULTIPLE)

  // Counted while filling rather than over the whole window, so `skipped` is
  // what was passed over to reach these cards and not a total.
  const requests: ToolRequest[] = []
  let skipped = 0
  for (const request of recent) {
    if (requests.length === VISIBLE_REQUESTS) break
    if (hasContent(request)) requests.push(request)
    else skipped++
  }

  if (requests.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing to show</EmptyTitle>
          <EmptyDescription>
            {skipped > 0
              ? `The ${skipped} newest rows in Bubble are blank — no job, movement, slot or tools on any of them.`
              : "Create a request and it will appear here and in the Bubble calendar."}
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
    <div className="flex flex-col gap-3">
      {/* {skipped > 0 && (
        <p className="text-sm text-muted-foreground">
          {skipped} newer {skipped === 1 ? "row" : "rows"} hidden: no job,
          movement, slot or tools on {skipped === 1 ? "it" : "them"}.
        </p>
      )} */}
      <div className={GRID}>
        {requests.map((request) => (
          <RequestCard key={request.id} request={request} />
        ))}
      </div>
    </div>
  )
}

/**
 * Delivery and pickup are the first thing anyone reads off a card, so each gets
 * its own accent, and a request that is both gets a third rather than looking
 * like one of them. The accents are the `--delivery` / `--pickup` / `--both`
 * tokens in `globals.css`; the first two are the hues `request.color` already
 * paints Bubble calendar events with.
 *
 * Each accent lands on the left rail, the card wash, the movement badge and the
 * tool quantities, so a card reads as one theme rather than as decoration.
 */
const MOVEMENT_THEMES = {
  delivery: {
    label: "Delivery",
    card: "border-l-delivery bg-card-delivery",
    badge: "bg-delivery/15 text-delivery-foreground",
    quantity: "bg-delivery/20 text-delivery-foreground",
  },
  pickup: {
    label: "Pickup",
    card: "border-l-pickup bg-card-pickup",
    badge: "bg-pickup/15 text-pickup-foreground",
    quantity: "bg-pickup/20 text-pickup-foreground",
  },
  both: {
    label: "Delivery + Pickup",
    card: "border-l-both bg-card-both",
    badge: "bg-both/15 text-both-foreground",
    quantity: "bg-both/20 text-both-foreground",
  },
  // The form will not submit one of these, but rows predating it exist.
  neither: {
    label: "No movement set",
    card: "border-l-border bg-card",
    badge: "bg-muted text-muted-foreground",
    quantity: "bg-muted text-foreground",
  },
} as const

function themeFor(request: ToolRequest) {
  if (request.delivery && request.pickup) return MOVEMENT_THEMES.both
  if (request.delivery) return MOVEMENT_THEMES.delivery
  if (request.pickup) return MOVEMENT_THEMES.pickup
  return MOVEMENT_THEMES.neither
}

function RequestCard({ request }: { request: ToolRequest }) {
  const theme = themeFor(request)
  const totalTools = request.tools.reduce((sum, tool) => sum + tool.quantity, 0)

  const hasNotes = request.notes || request.toolsNotes
  const hasActions = request.pickup || request.delivery

  return (
    <Card
      data-size="sm"
      className={cn("flex h-130 flex-col gap-0 overflow-hidden", theme.card)}
    >
      {/* Fixed Header */}
      <CardHeader className="shrink-0 gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={theme.badge}>{theme.label}</Badge>
          {request.completed && <Badge>Completed</Badge>}
          {request.tentative && <Badge variant="outline">Tentative</Badge>}
        </div>

        <CardTitle className="text-base leading-snug wrap-anywhere">
          {request.job}
        </CardTitle>

        {(request.toDo || request.weAre) && (
          <CardDescription className="flex flex-wrap gap-1.5">
            {request.toDo && <Badge variant="secondary">{request.toDo}</Badge>}
            {request.weAre && <Badge variant="outline">{request.weAre}</Badge>}
          </CardDescription>
        )}
      </CardHeader>

      {/* Scrollable Content */}
      <CardContent className="my-3 min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5">
            <Fact label="Dates">
              {newYorkRangeLabel(request.start, request.end)}
            </Fact>

            {request.timeRange && (
              <Fact label="Time slot">{request.timeRange}</Fact>
            )}

            {request.floor && <Fact label="Floor">{request.floor}</Fact>}

            {request.fieldPm && <Fact label="Field PM">{request.fieldPm}</Fact>}

            {request.contact && (
              <Fact label="Contact">
                {request.contact}
                {request.contactPhone && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {request.contactPhone}
                  </span>
                )}
              </Fact>
            )}
          </dl>

          <div className="overflow-hidden rounded-lg border bg-background/70">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
              <FactLabel>Tools</FactLabel>

              {request.tools.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {request.tools.length}{" "}
                  {request.tools.length === 1 ? "tool" : "tools"} · {totalTools}{" "}
                  total items
                </span>
              )}
            </div>

            {request.tools.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-muted-foreground">
                No tools listed.
              </p>
            ) : (
              <ul className="divide-y">
                {request.tools.map((tool) => (
                  <li
                    key={tool.name}
                    className="flex items-center justify-between gap-4 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 text-sm wrap-anywhere">
                      {tool.name}
                    </span>

                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
                        theme.quantity
                      )}
                    >
                      Qty: {tool.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hasNotes && (
            <div className="flex flex-col gap-2 border-t pt-4">
              {request.notes && <Note label="Notes">{request.notes}</Note>}

              {request.toolsNotes && (
                <Note label="Tool notes">{request.toolsNotes}</Note>
              )}
            </div>
          )}
        </div>
      </CardContent>

      {/* Always Fixed at Bottom */}
      {hasActions && (
        <CardFooter className="mt-auto shrink-0 gap-2 border-t">
          {request.pickup && (
            <Button size="sm" className="flex-1">
              Accept Pickup
            </Button>
          )}

          {request.delivery && (
            <Button size="sm" variant="outline" className="flex-1">
              Assign Tools
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

function FactLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  )
}

/** A `dt`/`dd` pair, so it has to be a fragment inside the `dl`'s grid. */
function Fact({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt>
        <FactLabel>{label}</FactLabel>
      </dt>
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </>
  )
}

function Note({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <FactLabel>{label}</FactLabel>
      <p className="wrap-anywhere whitespace-pre-line text-muted-foreground">
        {children}
      </p>
    </div>
  )
}

function RequestListSkeleton() {
  return (
    <div className={GRID}>
      {Array.from({ length: 6 }, (_, key) => (
        <Skeleton key={key} className="h-80 w-full rounded-xl" />
      ))}
    </div>
  )
}
