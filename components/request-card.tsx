import { ListChecksIcon } from "lucide-react"
import Link from "next/link"

import { FactLabel, RequestCardFacts } from "@/components/request-card-facts"
import { RequestCardAction, RequestCardTripNotice, type TripPoolState } from "@/components/request-card-action"
import { RequestCardMaterials } from "@/components/request-card-materials"
import { RequestStatusBadge } from "@/components/request-status-badge"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { ToolRequest } from "@/lib/bubble/requests"
import { cn } from "@/lib/utils"

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
  delivery: { label: "Delivery", badge: "bg-delivery/50 text-white", header: "bg-delivery/15" },
  pickup: { label: "Pickup", badge: "bg-pickup/50 text-white", header: "bg-pickup/15" },
  both: { label: "Delivery + Pickup", badge: "bg-both/50 text-white", header: "bg-both/15" },
  neither: { label: "No movement set", badge: "bg-muted text-muted-foreground", header: "bg-muted/50" },
} as const

function themeFor(request: ToolRequest) {
  if (request.delivery && request.pickup) return MOVEMENT_THEMES.both
  if (request.delivery) return MOVEMENT_THEMES.delivery
  if (request.pickup) return MOVEMENT_THEMES.pickup
  return MOVEMENT_THEMES.neither
}

/** One request on `/requests` — the same card on both the Active and All tabs. */
export function RequestCard({ request, pool }: { request: ToolRequest; pool: TripPoolState }) {
  const theme = themeFor(request)

  return (
    <Card
      data-size="sm"
      className={cn(
        "flex h-130 flex-col gap-0 overflow-hidden p-0",
        request.status === "Delivered" && "ring-status-ok/30"
      )}
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
          <RequestCardFacts request={request} />
          <RequestCardTools request={request} />
          <RequestCardMaterials lines={request.materialLines} legacy={request.legacyMaterials} />

          {(request.notes || request.toolsNotes) && (
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
          do; the same goes for "Add to a trip" once nothing is left to move. */}
      <CardFooter className="shrink-0 flex-col gap-2 border-t pb-(--card-spacing)">
        <RequestCardTripNotice request={request} pool={pool} />
        <Link
          href={`/requests/${request.id}`}
          className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
        >
          <ListChecksIcon />
          <span className="truncate">View Request</span>
        </Link>
        <RequestCardAction request={request} pool={pool} />
      </CardFooter>
    </Card>
  )
}

function RequestCardTools({ request }: { request: ToolRequest }) {
  const totalTools = request.tools.reduce((sum, tool) => sum + tool.quantity, 0)
  const counts = [
    request.tools.length > 0 &&
      `${request.tools.length} ${request.tools.length === 1 ? "tool" : "tools"} · ${totalTools} total items`,
    request.materialLines.length > 0 &&
      `${request.materialLines.length} ${request.materialLines.length === 1 ? "material" : "materials"}`,
  ].filter(Boolean)

  return (
    <div className="overflow-hidden rounded-lg border bg-background/70">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <FactLabel>Tools</FactLabel>
        {counts.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{counts.join(" · ")}</span>
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
  )
}

function Note({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <FactLabel>{label}</FactLabel>
      <p className="wrap-anywhere whitespace-pre-line text-muted-foreground">{children}</p>
    </div>
  )
}
