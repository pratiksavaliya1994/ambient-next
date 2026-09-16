import { CheckCircle2Icon, ClipboardListIcon, TruckIcon, XCircleIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { TripStatus } from "@/lib/trips/plan-types"
import { cn } from "@/lib/utils"

/**
 * `trip.status` as a pill, on the same `--status-*` ramp
 * `RequestStatusBadge` uses — so a trip and the requests it carries speak one
 * colour language rather than two.
 *
 * `Planned` is deliberately the quiet one: a draft has written nothing to
 * `tools` or `request`, and it should not look like something is under way.
 */
const THEMES: Record<TripStatus, { badge: string; icon: typeof TruckIcon }> = {
  Planned: { badge: "border-transparent bg-muted text-muted-foreground", icon: ClipboardListIcon },
  "In Transit": {
    badge: "border-transparent bg-status-attention/15 text-status-attention-foreground",
    icon: TruckIcon,
  },
  Completed: { badge: "border-transparent bg-status-ok/15 text-status-ok-foreground", icon: CheckCircle2Icon },
  Cancelled: { badge: "border-transparent bg-muted text-muted-foreground line-through", icon: XCircleIcon },
}

export function TripStatusBadge({ status, className }: { status: TripStatus; className?: string }) {
  const theme = THEMES[status]
  const Icon = theme.icon

  return (
    <Badge className={cn(theme.badge, className)}>
      <Icon />
      {status}
    </Badge>
  )
}
