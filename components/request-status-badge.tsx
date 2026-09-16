import { CheckCircle2Icon, ClipboardListIcon, PackageCheckIcon, TruckIcon, WarehouseIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { statusStepIndex, type RequestStatus } from "@/lib/bubble/enums"
import { cn } from "@/lib/utils"

/**
 * `request.status` as a pill — shared by the requests list and the detail
 * screen so the seven states read the same everywhere.
 *
 * Same shape as `MOVEMENT_THEMES` on the requests page: one hardcoded theme
 * per value, keyed by the value itself. The palette is the app's existing
 * status ramp (`--status-*` in `globals.css`), reused so a request's status and
 * a tool's status don't invent two different colour languages: neutral until
 * something happens, blue once tools are on it, amber while it is moving,
 * green when it has landed.
 *
 * **Both partials share `In Transit`'s amber**, deliberately: a partially
 * delivered request is still moving, and colouring it green-ish would read as
 * finished to anyone scanning the list — which is the exact mistake phase 4
 * exists to stop. The words differ; the urgency does not.
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
  "Partially Delivered": {
    badge: "border-transparent bg-status-attention/15 text-status-attention-foreground",
    icon: TruckIcon,
  },
  Delivered: { badge: "border-transparent bg-status-ok/15 text-status-ok-foreground", icon: CheckCircle2Icon },
  "Partially Returned": {
    badge: "border-transparent bg-status-attention/15 text-status-attention-foreground",
    icon: TruckIcon,
  },
  Returned: { badge: "border-transparent bg-status-ok/15 text-status-ok-foreground", icon: WarehouseIcon },
}

/**
 * Where a status sits on its branch's stepper.
 *
 * Was `REQUEST_STATUS.indexOf(status)` until phase 4. That stopped being right
 * when the union grew two partials and a second terminal value: a partial is a
 * variant of `In Transit`, not a step, so `statusStepIndex` maps it onto slot 2
 * rather than giving it a column of its own. See `lib/bubble/enums.ts`.
 */
export function statusIndex(status: RequestStatus): number {
  return statusStepIndex(status)
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
