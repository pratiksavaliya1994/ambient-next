import Link from "next/link"
import { PackageIcon, WrenchIcon } from "lucide-react"

import { InTransitMaterialRow, InTransitToolRow } from "@/components/in-transit-cargo-rows"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { newYorkTimeLabel } from "@/lib/bubble/dates"
import { NO_DRIVER, type InTransitLoad } from "@/lib/trips/in-transit"
import type { DestinationGroup, DriverGroup } from "@/lib/trips/in-transit-filters"
import { cn } from "@/lib/utils"

/**
 * One driver, one card — everything on their truck, split by where it's
 * headed. Visually a sibling of `WarehouseTypeCard` and `LocationCard` (same
 * amber band, same density); the band carries one count per kind of cargo,
 * each in its kind's accent (`tool` cyan, `material` magenta).
 */
export function InTransitDriverCard({ group, trips }: { group: DriverGroup; trips: InTransitLoad["trips"] }) {
  return (
    <Card className="gap-1 border ring-0 [--card-spacing:--spacing(2)]">
      <CardHeader className="-mt-(--card-spacing) items-center bg-primary py-0.5">
        <CardTitle
          className={cn("truncate text-sm text-primary-foreground", group.driver === NO_DRIVER && "italic opacity-70")}
          title={group.driver}
        >
          {group.driver}
        </CardTitle>
        <CardAction className="flex gap-1 self-center">
          {group.toolCount > 0 && (
            <Badge className="h-4 gap-0.5 bg-card px-1.5 text-[10px] text-tool-foreground tabular-nums" title="Tools">
              <WrenchIcon />
              {group.toolCount}
            </Badge>
          )}
          {group.materialCount > 0 && (
            <Badge className="h-4 gap-0.5 bg-card px-1.5 text-[10px] text-material-foreground tabular-nums" title="Materials">
              <PackageIcon />
              {group.materialCount}
            </Badge>
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-0.5 overflow-x-hidden px-1">
        {group.tripIds.length > 0 && <TripLinks tripIds={group.tripIds} trips={trips} />}
        {group.destinations.map((destination) => (
          <DestinationBlock key={destination.destination} group={destination} />
        ))}
      </CardContent>
    </Card>
  )
}

/** "Trip · out 7:42 am" per running trip — usually one, and each opens its run sheet. */
function TripLinks({ tripIds, trips }: { tripIds: string[]; trips: InTransitLoad["trips"] }) {
  return (
    <p className="flex flex-wrap gap-x-2 px-1 text-[10px] text-muted-foreground">
      {tripIds.map((id) => {
        const startedAt = trips[id]?.startedAt
        return (
          <Link key={id} href={`/trips/${id}`} className="hover:text-primary hover:underline">
            Trip{startedAt ? ` · out ${newYorkTimeLabel(startedAt)}` : ""}
          </Link>
        )
      })}
    </p>
  )
}

/** Micro-header (same look as the Job Dashboard's type headers), then tools, then materials. */
function DestinationBlock({ group }: { group: DestinationGroup }) {
  const count = group.tools.length + group.materials.length
  return (
    <>
      <div className="flex items-center gap-1.5 px-1 pt-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        <span className="truncate" title={group.destination}>
          → {group.destination}
        </span>
        <span className="h-px flex-1 bg-border" />
        <span className="tabular-nums opacity-70">{count}</span>
      </div>
      {group.tools.map((tool) => (
        <InTransitToolRow key={tool.key} tool={tool} />
      ))}
      {group.materials.map((material) => (
        <InTransitMaterialRow key={material.key} material={material} />
      ))}
    </>
  )
}
