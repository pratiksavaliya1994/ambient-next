import { CheckCircle2Icon, ClipboardListIcon, PackageCheckIcon, TruckIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { REQUEST_STATUS, type RequestStatus } from "@/lib/bubble/enums"
import { cn } from "@/lib/utils"

/**
 * `request.status`, the phase 2 lifecycle, as a pill — shared by the requests
 * list and the detail screen so the four states read the same everywhere.
 *
 * Same shape as `MOVEMENT_THEMES` on the requests page: one hardcoded theme
 * per value, keyed by the value itself. The palette is the app's existing
 * status ramp (`--status-*` in `globals.css`), reused so a request's status and
 * a tool's status don't invent two different colour languages: neutral until
 * something happens, blue once tools are on it, amber while it is moving,
 * green when it has landed.
 */
const STATUS_THEMES: Record<RequestStatus, { badge: string; icon: typeof TruckIcon }> = {
  New: { badge: "border-transparent bg-muted text-muted-foreground", icon: ClipboardListIcon },
  Assigned: {
    badge: "border-transparent bg-status-active/15 text-status-active-foreground",
    icon: PackageCheckIcon,
  },
  "In Transit": {
    badge: "border-transparent bg-status-attention/15 text-status-attention-foreground",
    icon: TruckIcon,
  },
  Delivered: { badge: "border-transparent bg-status-ok/15 text-status-ok-foreground", icon: CheckCircle2Icon },
}

/** Where a status sits in the lifecycle — what the detail page's stepper walks. */
export function statusIndex(status: RequestStatus): number {
  return REQUEST_STATUS.indexOf(status)
}

export function statusIcon(status: RequestStatus) {
  return STATUS_THEMES[status].icon
}

export function RequestStatusBadge({
  status,
  showIcon = true,
  className,
}: {
  status: RequestStatus
  showIcon?: boolean
  className?: string
}) {
  const theme = STATUS_THEMES[status]
  const Icon = theme.icon

  return (
    <Badge className={cn(theme.badge, className)}>
      {showIcon && <Icon />}
      {status}
    </Badge>
  )
}
