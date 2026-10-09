import { BanIcon, CheckCircle2Icon, PackageCheckIcon, TruckIcon, WarehouseIcon, WrenchIcon } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { isPickupRequest, type RequestStatus } from "@/lib/bubble/enums"
import type { ToolRequest } from "@/lib/bubble/requests"
import { cn } from "@/lib/utils"

type NextAction = {
  label: string
  icon: typeof WrenchIcon
  /** `null` means the step has no next action — the lifecycle is over. */
  href: ((requestId: string) => string) | null
  className: string
  /** Leads into the trip builder — only honest when the builder would list this request. See `TripPoolState`. */
  trip?: true
}

/**
 * The one thing to do next, per status — the same lifecycle step the detail
 * page's `NextAction` offers, as the second footer button on a card.
 *
 * `Delivered`'s `href` stays `null`: the lifecycle is over, so its card renders
 * no second action at all rather than a dead button. Each step carries its own
 * `--status-*` ramp from `globals.css` — the same palette `RequestStatusBadge`
 * uses — so the footer button and the header badge say the same thing in the
 * same hue: blue while tools are being named, amber while it is moving, green
 * once it has landed.
 */
const NEXT_ACTIONS: Record<RequestStatus, NextAction> = {
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
    href: (id) => `/trips/new?requestId=${id}`,
    className:
      "border-status-attention/40 bg-status-attention/25 text-status-attention-foreground hover:bg-status-attention/40 dark:bg-status-attention/30",
    trip: true,
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
    trip: true,
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
    trip: true,
  },
  Returned: {
    label: "Returned",
    icon: WarehouseIcon,
    href: null,
    className:
      "border-status-ok/40 bg-status-ok/25 text-status-ok-foreground hover:bg-status-ok/40 dark:bg-status-ok/30",
  },
  Cancelled: {
    label: "Cancelled",
    icon: BanIcon,
    href: null,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
}

/**
 * The pickup overrides. Both maps keyed off `status` **alone**, so a
 * pickup-only request at `Assigned` offered **"Assign tools"** pointing at
 * `/requests/[id]/assign` — a screen built entirely around requested tool
 * *types* and their quantities, which a pickup request does not have. Its tools
 * are named at creation.
 *
 * Only the two states that actually differ are overridden; everything else
 * falls through to `NEXT_ACTIONS`.
 */
const PICKUP_NEXT_ACTIONS: Partial<Record<RequestStatus, NextAction>> = {
  New: {
    label: "Add to a trip",
    icon: TruckIcon,
    href: (id) => `/trips/new?requestId=${id}`,
    className:
      "border-status-active/40 bg-status-active/20 text-status-active-foreground hover:bg-status-active/35 dark:bg-status-active/25",
    trip: true,
  },
  Assigned: {
    label: "Add to a trip",
    icon: TruckIcon,
    href: (id) => `/trips/new?requestId=${id}`,
    className:
      "border-status-attention/40 bg-status-attention/25 text-status-attention-foreground hover:bg-status-attention/40 dark:bg-status-attention/30",
    trip: true,
  },
}

/**
 * The assign screen names tools *and* approves material lines, so the label
 * says whichever of the two this request actually asks for.
 */
export function assignLabelFor(request: ToolRequest) {
  const tools = request.tools.length > 0
  const materials = request.materialLines.length > 0
  if (tools && materials) return "Assign tools & materials"
  return materials ? "Assign materials" : "Assign tools"
}

export function nextActionFor(request: ToolRequest) {
  const pickupAction = isPickupRequest(request) ? PICKUP_NEXT_ACTIONS[request.status] : undefined
  if (pickupAction) return pickupAction
  const action = NEXT_ACTIONS[request.status]
  return request.status === "New" ? { ...action, label: assignLabelFor(request) } : action
}

/**
 * Where this request stands in the trip builder's pool:
 *
 * - `waiting` — the builder lists it; "Add to a trip" lands somewhere useful.
 * - `claimed` — it has tools left to move, but another trip already holds every
 *   one of them (`shownMovements` drops those), so the builder would be empty.
 * - `none` — nothing of it is left to move at all.
 * - `null` — the pool couldn't be read; the button shows as it always did.
 *
 * Without this a request whose remaining tools were all on a planned trip kept
 * offering "Add to a trip", and it led to an empty builder.
 */
export type TripPoolState = "waiting" | "claimed" | "none" | null

/**
 * Stands in for "Add to a trip" when another trip already holds everything
 * left. A left-aligned callout above the buttons rather than in the button's
 * slot, so it reads as status and the buttons keep the bottom of the card.
 */
export function RequestCardTripNotice({ request, pool }: { request: ToolRequest; pool: TripPoolState }) {
  if (!nextActionFor(request).trip || pool !== "claimed") return null

  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg bg-status-attention/10 px-3 py-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-status-attention/20 text-status-attention-foreground">
        <TruckIcon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium">Already on a trip</span>
        <span className="text-xs text-muted-foreground">All assigned tools are booked.</span>
      </div>
    </div>
  )
}

/**
 * What a delivery offers instead of "Add to a trip" once another trip holds
 * everything assigned: the request is still open, so more tools can be added
 * and sent on a trip of their own. Never a pickup — its tools are fixed.
 */
const ASSIGN_MORE: NextAction = {
  label: "Assign more",
  icon: WrenchIcon,
  href: (id) => `/requests/${id}/assign`,
  className:
    "border-status-active/40 bg-status-active/20 text-status-active-foreground hover:bg-status-active/35 dark:bg-status-active/25",
}

export function RequestCardAction({ request, pool }: { request: ToolRequest; pool: TripPoolState }) {
  const next = nextActionFor(request)
  const action = next.trip && pool === "claimed" && !isPickupRequest(request) ? ASSIGN_MORE : next
  const ActionIcon = action.icon

  if (!action.href || (action.trip && pool !== "waiting" && pool !== null)) return null

  return (
    <Link
      href={action.href(request.id)}
      className={buttonVariants({ size: "sm", className: cn("w-full", action.className) })}
    >
      <ActionIcon />
      <span className="truncate">{action.label}</span>
    </Link>
  )
}
