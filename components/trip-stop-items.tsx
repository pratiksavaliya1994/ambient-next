import { ArrowDownToLineIcon, ArrowUpFromLineIcon, UndoIcon } from "lucide-react"

import { TripStopItemLine, type StopItem, type StopItemTone } from "@/components/trip-stop-item-line"
import { TripStopMaterialLine, type StopMaterial } from "@/components/trip-stop-material-line"
import type { RequestStopInfo, SiteContact } from "@/lib/bubble/requests"
import { dropOutcome, isTransferCollect } from "@/lib/bubble/trips-types"
import type { StopKind } from "@/lib/trips/plan-types"
import { cn } from "@/lib/utils"

/**
 * What happens at one stop, in two lists: **collect** and **drop**.
 *
 * Shared by the builder's preview and the run sheet, so a stop reads the same
 * whether it is being planned or driven. This pair is what replaced nested
 * pickups — the old screens hung a collect-from-elsewhere under the request it
 * served, which told a driver what a tool was *for* but never where to go.
 *
 * Each half is a **labelled block of one-line rows** rather than a strip of
 * pills: "Pick up" and "Drop off" are the two things a driver scans for, and as
 * plain text beside an icon they were indistinguishable from the tool names
 * under them. Material lines sit in the same block, under the tools.
 */
export function TripStopItems({
  collect,
  drop,
  refused = [],
  collectMaterials = [],
  dropMaterials = [],
  refusedMaterials = [],
  kind,
  location,
  requests,
  siteContacts,
  className,
}: {
  collect: readonly StopItem[]
  drop: readonly StopItem[]
  /**
   * Tools this stop turned away. Optional because the builder's preview plans a
   * route that hasn't been driven yet, so nothing can have been refused on it.
   */
  refused?: readonly StopItem[]
  /** The same three lists for material lines. */
  collectMaterials?: readonly StopMaterial[]
  dropMaterials?: readonly StopMaterial[]
  refusedMaterials?: readonly StopMaterial[]
  kind: StopKind
  /**
   * Which request each `requestId` names — optional because the builder's
   * preview has no server-fetched contact info to look one up in, and a tool
   * with no request (a site-to-site leg) never has one anyway.
   */
  requests?: ReadonlyMap<string, RequestStopInfo>
  /** The stop's own place — what a transfer collect's contact is looked up by. */
  location?: string
  /**
   * Each job site's own contact, for collects made here on behalf of another
   * job (`isTransferCollect`). A promise, so the run sheet draws without it;
   * only an opened popover waits. Absent in the builder's preview.
   */
  siteContacts?: Promise<ReadonlyMap<string, SiteContact>>
  className?: string
}) {
  const blocks = [
    { tone: "collect" as const, label: "Pick up", Icon: ArrowUpFromLineIcon, items: collect, materials: collectMaterials },
    { tone: "drop" as const, label: dropOutcome(kind).verb, Icon: ArrowDownToLineIcon, items: drop, materials: dropMaterials },
    // Last, and after the drop it failed to be: the stop's work reads in the
    // order it happened, ending with what didn't.
    { tone: "refused" as const, label: "Refused here", Icon: UndoIcon, items: refused, materials: refusedMaterials },
  ].filter((block) => block.items.length + block.materials.length > 0)

  // Only collects can be transfers: a drop at a job site is always for that
  // site's own delivery.
  const site =
    location !== undefined && siteContacts
      ? { stop: { kind, location }, contacts: siteContacts }
      : undefined

  if (blocks.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing happens here.</p>
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {blocks.map((block) => (
        <ItemBlock
          key={block.tone}
          {...block}
          requests={requests}
          site={block.tone === "collect" ? site : undefined}
        />
      ))}
    </div>
  )
}

/** One half of a stop's work, under a heading loud enough to find at a glance. */
function ItemBlock({
  label,
  Icon,
  tone,
  items,
  materials,
  requests,
  site,
}: {
  label: string
  Icon: typeof ArrowUpFromLineIcon
  tone: StopItemTone
  items: readonly StopItem[]
  materials: readonly StopMaterial[]
  requests?: ReadonlyMap<string, RequestStopInfo>
  site?: {
    stop: { kind: StopKind; location: string }
    contacts: Promise<ReadonlyMap<string, SiteContact>>
  }
}) {
  return (
    <section className="overflow-hidden rounded-md border">
      <header
        className={cn(
          "flex items-center gap-1.5 px-2 py-1",
          tone === "drop" && "bg-status-ok/15 text-status-ok-foreground",
          tone === "collect" && "bg-status-active/15 text-status-active-foreground",
          tone === "refused" && "bg-status-attention/15 text-status-attention-foreground"
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[11px] font-semibold tracking-wide uppercase">{label}</span>
        <span className="ml-auto text-[11px] font-medium tabular-nums">{blockCount(items.length, materials.length)}</span>
      </header>
      <ul className="divide-y">
        {items.map((item) => {
          const request = item.requestId ? requests?.get(item.requestId) : undefined
          const transfer = site && isTransferCollect(site.stop, request)
          return (
            <TripStopItemLine
              key={item.toolId}
              item={item}
              tone={tone}
              request={transfer ? undefined : request}
              site={transfer ? { location: site.stop.location, contacts: site.contacts } : undefined}
            />
          )
        })}
        {materials.map((material) => (
          <TripStopMaterialLine key={material.lineId} material={material} tone={tone} />
        ))}
      </ul>
    </section>
  )
}

/** `3` for tools alone, as before; `3 tools · 2 materials` once lines are in the block too. */
function blockCount(tools: number, materials: number): string {
  if (materials === 0) return String(tools)
  const lines = `${materials} ${materials === 1 ? "material" : "materials"}`
  return tools === 0 ? lines : `${tools} ${tools === 1 ? "tool" : "tools"} · ${lines}`
}
