import { CheckCircle2Icon, ListChecksIcon, PackageCheckIcon, TruckIcon, WarehouseIcon, WrenchIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { NewRequestDialog, NewRequestFab } from "@/components/new-request-dialog"
import { RequestSearchBar } from "@/components/request-search"
import { RequestStatusBadge } from "@/components/request-status-badge"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { newYorkDayLabel, newYorkDaysAgo, newYorkInstant } from "@/lib/bubble/dates"
import { isPickupRequest, type RequestStatus } from "@/lib/bubble/enums"
import { hasContent, listRequestsSince, searchRequests, type ToolRequest } from "@/lib/bubble/requests"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Tool requests" }

/**
 * How many New York days of requests the page shows, counting today: 2 is
 * today and yesterday. A window rather than a fixed card count, so the page
 * always covers the same stretch of time no matter how busy a day was.
 */
const DAYS_SHOWN = 5

/**
 * `auto-fill` rather than a fixed column count: the cards keep a readable
 * floor of 18rem and a row simply holds fewer — or, on a wide warehouse
 * monitor, more — of them as the window resizes, down to one on a phone.
 * `min(…, 100%)` stops that floor from overflowing a viewport narrower than
 * a single card.
 */
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-6"

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>
}) {
  const { q = "", from = "", to = "" } = await searchParams
  const isSearching = Boolean(q.trim() || from || to)
  const searchKey = `${q}|${from}|${to}`

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">{isSearching ? "Search results" : "Recent requests"}</h1>
        </div>
        <NewRequestDialog />
      </div>

      <RequestSearchBar key={`search-${searchKey}`} query={q} from={from} to={to} />

      {/* Bubble needs two round trips for this and is not fast; stream it.
          Keyed by the search itself so navigating between searches (or back
          to the default view) resets this boundary to its fallback rather
          than leaving the previous results on screen. Prefixed so this key
          doesn't collide with RequestSearchBar's above — both are keyed off
          the same searchKey, and React requires keys to be unique among
          siblings regardless of element type. */}
      <Suspense key={`results-${searchKey}`} fallback={<RequestListSkeleton />}>
        <RequestList q={q} from={from} to={to} isSearching={isSearching} />
      </Suspense>

      <NewRequestFab />
    </div>
  )
}

async function RequestList({
  q,
  from,
  to,
  isSearching,
}: {
  q: string
  from: string
  to: string
  isSearching: boolean
}) {
  // Midnight New York on the oldest day in the default window —
  // `DAYS_SHOWN - 1` days back, since the window counts today as one of its
  // days. Note the two disagree on which date they mean: the default window is
  // `Created Date`, while a search sweeps job/PM/contact/floor and filters on
  // the drop/pickup date (`requestDateStart`) — the one the cards display —
  // across the whole table, unbounded by this window.
  const found = isSearching
    ? await searchRequests({ query: q, from: from || undefined, to: to || undefined })
    : await listRequestsSince(newYorkInstant(newYorkDaysAgo(DAYS_SHOWN - 1)))

  // Roughly half the rows Bubble holds are abandoned blanks, so the window is
  // filtered rather than shown as-is; `skipped` is how many of these two days'
  // rows were blank.
  const requests: ToolRequest[] = []
  let skipped = 0
  for (const request of found) {
    if (hasContent(request)) requests.push(request)
    else skipped++
  }

  if (requests.length === 0) {
    if (isSearching) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No matching requests</EmptyTitle>
            <EmptyDescription>
              {q.trim()
                ? `Nothing matches "${q.trim()}"${from || to ? " scheduled in that date range" : ""}.`
                : "Nothing is scheduled in that date range."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/requests" className={buttonVariants({ variant: "outline" })}>
              Clear search
            </Link>
          </EmptyContent>
        </Empty>
      )
    }

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing to show</EmptyTitle>
          <EmptyDescription>
            {skipped > 0
              ? `All ${skipped} rows created today and yesterday are blank — no job, movement, slot or tools on any of them.`
              : "Nothing has been created today or yesterday. Create a request and it will appear here and in the Bubble calendar."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <NewRequestDialog />
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
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
 * The accent shows only on the header's movement badge — the rest of the card
 * stays neutral so the badge is what carries the theme, not a colored wash.
 */
const MOVEMENT_THEMES = {
  delivery: {
    label: "Delivery",
    badge: "bg-delivery/50 text-white",
    header: "bg-delivery/15",
  },
  pickup: {
    label: "Pickup",
    badge: "bg-pickup/50 text-white",
    header: "bg-pickup/15",
  },
  both: {
    label: "Delivery + Pickup",
    badge: "bg-both/50 text-white",
    header: "bg-both/15",
  },
  neither: {
    label: "No movement set",
    badge: "bg-muted text-muted-foreground",
    header: "bg-muted/50",
  },
} as const

function themeFor(request: ToolRequest) {
  if (request.delivery && request.pickup) return MOVEMENT_THEMES.both
  if (request.delivery) return MOVEMENT_THEMES.delivery
  if (request.pickup) return MOVEMENT_THEMES.pickup
  return MOVEMENT_THEMES.neither
}

/**
 * The one thing to do next, per status — the same lifecycle step the detail
 * page's `NextAction` offers, as the second footer button on a card.
 *
 * `Assigned` links to `/dispatch?requestId={id}` rather than a per-request
 * route — `/dispatch` is a shared board across many requests, and the query
 * param preselects this one there (`DispatchBoard` reads it); see the detail
 * page's `NextAction` for the same pattern. `Delivered`'s `href` stays `null`:
 * the lifecycle is over, so its card renders no second action at all rather
 * than a dead button — see `RequestCard`. Each step carries its own
 * `--status-*` ramp from `globals.css` — the same palette `RequestStatusBadge`
 * uses — so the footer button and the header badge say the same thing in the
 * same hue: blue while tools are being named, amber while it is moving, green
 * once it has landed.
 */
const NEXT_ACTIONS: Record<
  RequestStatus,
  {
    label: string
    icon: typeof WrenchIcon
    /** `null` means the step has no next action — the lifecycle is over. */
    href: ((requestId: string) => string) | null
    className: string
  }
> = {
  New: {
    label: "Assign tools",
    icon: WrenchIcon,
    href: (id) => `/requests/${id}/assign`,
    className:
      "border-status-active/40 bg-status-active/20 text-status-active-foreground hover:bg-status-active/35 dark:bg-status-active/25",
  },
  Assigned: {
    label: "Add to a trip",
    icon: TruckIcon,
    href: (id) => `/dispatch?requestId=${id}`,
    className:
      "border-status-attention/40 bg-status-attention/25 text-status-attention-foreground hover:bg-status-attention/40 dark:bg-status-attention/30",
  },
  "In Transit": {
    label: "Track trip",
    icon: PackageCheckIcon,
    href: (id) => `/requests/${id}`,
    className:
      "border-status-repair/40 bg-status-repair/25 text-status-repair-foreground hover:bg-status-repair/40 dark:bg-status-repair/30",
  },
  // Both partials keep a live action: that is the whole point of them — the
  // request is half-done and the rest still has to get on a trip.
  "Partially Delivered": {
    label: "Add to a trip",
    icon: TruckIcon,
    href: (id) => `/trips/new?requestId=${id}`,
    className:
      "border-status-attention/40 bg-status-attention/25 text-status-attention-foreground hover:bg-status-attention/40 dark:bg-status-attention/30",
  },
  Delivered: {
    label: "Delivered",
    icon: CheckCircle2Icon,
    href: null,
    className:
      "border-status-ok/40 bg-status-ok/25 text-status-ok-foreground hover:bg-status-ok/40 dark:bg-status-ok/30",
  },
  "Partially Returned": {
    label: "Add to a trip",
    icon: TruckIcon,
    href: (id) => `/trips/new?requestId=${id}`,
    className:
      "border-status-attention/40 bg-status-attention/25 text-status-attention-foreground hover:bg-status-attention/40 dark:bg-status-attention/30",
  },
  Returned: {
    label: "Returned",
    icon: WarehouseIcon,
    href: null,
    className:
      "border-status-ok/40 bg-status-ok/25 text-status-ok-foreground hover:bg-status-ok/40 dark:bg-status-ok/30",
  },
}

/**
 * The pickup overrides — a live bug until now, and one 3B would have made
 * reachable on every new request had phase 4 not folded it in.
 *
 * Both maps keyed off `status` **alone**, so a pickup-only request at
 * `Assigned` offered **"Assign tools"** pointing at `/requests/[id]/assign` —
 * a screen built entirely around requested tool *types* and their quantities,
 * which a pickup request does not have. Its tools are named at creation.
 *
 * Only the two states that actually differ are overridden; everything else
 * falls through to `NEXT_ACTIONS`.
 */
const PICKUP_NEXT_ACTIONS: Partial<Record<RequestStatus, (typeof NEXT_ACTIONS)[RequestStatus]>> = {
  New: {
    label: "Add to a trip",
    icon: TruckIcon,
    href: (id) => `/trips/new?requestId=${id}`,
    className:
      "border-status-active/40 bg-status-active/20 text-status-active-foreground hover:bg-status-active/35 dark:bg-status-active/25",
  },
  Assigned: {
    label: "Add to a trip",
    icon: TruckIcon,
    href: (id) => `/trips/new?requestId=${id}`,
    className:
      "border-status-attention/40 bg-status-attention/25 text-status-attention-foreground hover:bg-status-attention/40 dark:bg-status-attention/30",
  },
}

export function nextActionFor(request: ToolRequest) {
  return (isPickupRequest(request) ? PICKUP_NEXT_ACTIONS[request.status] : undefined) ?? NEXT_ACTIONS[request.status]
}

/**
 * A request is a delivery date, a pickup date, or (rarely) both — and either
 * way only the start date is shown, so the box's own label follows suit
 * rather than always reading the generic "Date" a two-sided request needs.
 */
function dateLabelFor(request: ToolRequest) {
  if (request.pickup && !request.delivery) return "Pickup date"
  if (request.delivery && !request.pickup) return "Drop date"
  return "Date"
}

function RequestCard({ request }: { request: ToolRequest }) {
  const theme = themeFor(request)
  const action = nextActionFor(request)
  const ActionIcon = action.icon
  const totalTools = request.tools.reduce((sum, tool) => sum + tool.quantity, 0)
  const hasNotes = request.notes || request.toolsNotes

  const facts = [
    request.fieldPm && { label: "Field PM", value: request.fieldPm },
    request.floor && { label: "Floor", value: request.floor },
    request.contact && { label: "Contact", value: request.contact, sub: request.contactPhone },
  ].filter((fact): fact is { label: string; value: string; sub?: string | null } => Boolean(fact))

  const delivered = request.status === "Delivered"

  return (
    <Card
      data-size="sm"
      className={cn("flex h-130 flex-col gap-0 overflow-hidden p-0", delivered && "ring-status-ok/30")}
    >
      <div className={cn("flex justify-between gap-2 border-b px-4 py-3", theme.header)}>
        {/* The title is the link rather than the whole card: the card body
            scrolls, and an overlay covering it to make it clickable would
            swallow that scroll. */}
        <CardTitle className="text-base leading-snug wrap-anywhere">
          <Link href={`/requests/${request.id}`} className="hover:underline">
            {request.job}
          </Link>
        </CardTitle>
        <Badge className={cn("items-center justify-center tracking-wide uppercase", theme.badge)}>{theme.label}</Badge>
      </div>
      <CardHeader className="shrink-0 gap-2 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <RequestStatusBadge status={request.status} />
          {request.completed && <Badge>Completed</Badge>}
          {request.tentative && <Badge variant="outline">Tentative</Badge>}
        </div>

        {/* <CardTitle className="text-lg leading-snug wrap-anywhere">{request.job}</CardTitle> */}

        {(request.toDo || request.weAre) && (
          <CardDescription className="flex flex-wrap gap-1.5">
            {request.toDo && <Badge variant="secondary">{request.toDo}</Badge>}
            {request.weAre && <Badge variant="outline">{request.weAre}</Badge>}
          </CardDescription>
        )}
      </CardHeader>

      {/* Scrollable Content */}
      <CardContent className="my-1 min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4">
          {/* Date + window, side by side like a dispatch slip */}
          <div className="grid grid-cols-[auto_1fr] divide-x overflow-hidden rounded-lg border bg-background/70">
            <div className="flex min-w-28 flex-col gap-1 p-3">
              <FactLabel>{dateLabelFor(request)}</FactLabel>
              <span className="text-base leading-tight font-semibold wrap-anywhere">
                {newYorkDayLabel(request.start ?? request.end)}
              </span>
            </div>

            <div className="flex flex-col gap-1 p-3">
              <FactLabel>Window</FactLabel>
              <span className="text-sm leading-snug wrap-anywhere">{request.timeRange || "Not set"}</span>
            </div>
          </div>

          {/* Remaining facts as a tiled grid, hairline dividers between cells */}
          {facts.length > 0 && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
              {facts.map((fact, index) => (
                <div
                  key={fact.label}
                  className={cn(
                    "flex flex-col gap-0.5 bg-background/70 p-3",
                    facts.length % 2 === 1 && index === facts.length - 1 && "col-span-2"
                  )}
                >
                  <FactLabel>{fact.label}</FactLabel>
                  <span className="text-sm font-medium wrap-anywhere">{fact.value}</span>
                  {fact.sub && <span className="text-xs wrap-anywhere text-muted-foreground">{fact.sub}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border bg-background/70">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
              <FactLabel>Tools</FactLabel>

              {request.tools.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {request.tools.length} {request.tools.length === 1 ? "tool" : "tools"} · {totalTools} total items
                </span>
              )}
            </div>

            {request.tools.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-muted-foreground">No tools listed.</p>
            ) : (
              <ul className="divide-y">
                {request.tools.map((tool) => (
                  <li key={tool.name} className="flex items-center justify-between gap-4 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm wrap-anywhere">{tool.name}</span>

                    <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums">
                      Qty: {tool.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {request.materials.length > 0 && (
            <div className="overflow-hidden rounded-lg border bg-background/70">
              <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                <FactLabel>Materials</FactLabel>

                <span className="text-xs text-muted-foreground tabular-nums">
                  {request.materials.length} {request.materials.length === 1 ? "line" : "lines"}
                </span>
              </div>

              <ul className="divide-y">
                {request.materials.map((line, index) => (
                  <li key={index} className="px-3 py-2 text-sm wrap-anywhere">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasNotes && (
            <div className="flex flex-col gap-2 border-t pt-4">
              {request.notes && <Note label="Notes">{request.notes}</Note>}

              {request.toolsNotes && <Note label="Tool notes">{request.toolsNotes}</Note>}
            </div>
          )}
        </div>
      </CardContent>

      {/* The two things to do with a card: read the whole lifecycle, or take
          the next step in it. Pinned below the scroll area so both stay
          reachable however long the tool list is. Stacked full width rather
          than side by side so neither button's label gets cramped. Once
          `Delivered`, there is no next step — the lifecycle is over — so only
          `View Request` shows, rather than a second button with nothing to
          do. */}
      <CardFooter className="shrink-0 flex-col gap-2 border-t pb-(--card-spacing)">
        <Link
          href={`/requests/${request.id}`}
          className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
        >
          <ListChecksIcon />
          <span className="truncate">View Request</span>
        </Link>

        {action.href && (
          <Link
            href={action.href(request.id)}
            className={buttonVariants({ size: "sm", className: cn("w-full", action.className) })}
          >
            <ActionIcon />
            <span className="truncate">{action.label}</span>
          </Link>
        )}
      </CardFooter>
    </Card>
  )
}

function FactLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</span>
}

function Note({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <FactLabel>{label}</FactLabel>
      <p className="wrap-anywhere whitespace-pre-line text-muted-foreground">{children}</p>
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
