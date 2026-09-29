import { MapPinIcon, WarehouseIcon } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

const VIEWS = [
  { value: "warehouse", label: "Warehouse", href: "/materials", Icon: WarehouseIcon },
  { value: "sites", label: "By site", href: "/materials/sites", Icon: MapPinIcon },
] as const

/**
 * `/materials`' two views — the warehouse catalogue and what's out on job
 * sites — as two links styled as a segmented control.
 *
 * Links rather than tabs: each view is its own route with its own reads, so
 * the switch only ever navigates. The sidebar keeps its one Materials entry.
 */
export function MaterialsViewSwitch({ active }: { active: (typeof VIEWS)[number]["value"] }) {
  return (
    <nav aria-label="Materials view" className="inline-flex w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {VIEWS.map((view) => {
        const current = view.value === active
        return (
          <Link
            key={view.value}
            href={view.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
              current ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <view.Icon className="size-3.5" />
            {view.label}
          </Link>
        )
      })}
    </nav>
  )
}
