import { PhoneIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { Suspense, use } from "react"

import { CargoKindIcon } from "@/components/cargo-kind"
import type { RequestStopInfo, SiteContact } from "@/lib/bubble/requests"
import type { TripToolState } from "@/lib/trips/plan-types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * One tool at a stop, as a single line.
 *
 * Typed structurally rather than against `PlannedItem` or `TripToolRow`, since
 * both shapes flow through here and the only difference that matters is whether
 * a row has been acted on yet. The journey fields are optional for the same
 * reason: every caller has them today, and a caller that doesn't simply shows
 * one less detail rather than failing to render.
 */
export type StopItem = {
  toolId: string
  toolName: string
  toolType?: string
  fromLocation?: string
  toLocation?: string
  state?: TripToolState
  /** May be empty — a leg that belongs to no request. See `TripToolRow.requestId`. */
  requestId?: string
}

/**
 * Which part of a stop's work a line belongs to.
 *
 * `refused` is the odd one: not work, but a record of work that failed here.
 * The tool itself has moved on to the line-up at whichever yard stop takes it
 * home, so this is the only place the refusal is visible at the address it
 * happened at.
 */
export type StopItemTone = "collect" | "drop" | "refused"

/**
 * What it is, where its journey's *other* end is, and how far it has got.
 *
 * A line rather than the pill this replaced: a pill could only ever carry a
 * name, and the type and the far end of the journey are what a driver at the
 * tailgate is actually reading for. The two muted details drop off below `sm`
 * rather than wrapping the row — on a phone the name and the state are what
 * still has to fit.
 */
export function TripStopItemLine({
  item,
  tone,
  request,
  site,
}: {
  item: StopItem
  tone: StopItemTone
  /** Resolved from `item.requestId` by the caller — absent for a leg that belongs to no request. */
  request?: RequestStopInfo
  /**
   * Set instead of `request` on a transfer collect (`isTransferCollect`): the
   * tool's request is the far end's, so the popover names this site and its
   * own contact rather than someone who isn't here.
   */
  site?: { location: string; contacts: Promise<ReadonlyMap<string, SiteContact>> }
}) {
  // Settled-and-unhappy: struck through because there is nothing left to do
  // about it *here*. A refused tool sitting in the yard's drop list is live work
  // and deliberately reads as ordinary.
  const spent = item.state === "Skipped" || tone === "refused"
  // The end of the journey that *isn't* this stop — where it's headed when
  // collecting, where it came from when dropping. A refused tool waiting at the
  // yard inverts that: its far end is the site that sent it back, which is the
  // one thing worth knowing about it there.
  const sentBack = tone === "drop" && (item.state === "Refused" || item.state === "Returned")
  const elsewhere = tone === "collect" || sentBack ? item.toLocation : item.fromLocation

  return (
    <li
      className={cn(
        "flex items-center gap-2 border-l-4 border-l-foreground/25 px-2 py-1.5",
        spent ? "bg-status-attention/5" : "bg-background"
      )}
    >
      <CargoKindIcon kind="tool" />
      {site ? (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className={cn(
                  "min-w-0 truncate text-left text-xs font-medium underline decoration-dotted underline-offset-2",
                  spent && "text-muted-foreground line-through"
                )}
                title={`${item.toolName} — ${site.location}`}
              />
            }
          >
            {item.toolName}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 gap-2">
            <SitePopoverBody site={site} toolId={item.toolId} />
          </PopoverContent>
        </Popover>
      ) : request ? (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className={cn(
                  "min-w-0 truncate text-left text-xs font-medium underline decoration-dotted underline-offset-2",
                  spent && "text-muted-foreground line-through"
                )}
                title={`${item.toolName} — ${request.job}`}
              />
            }
          >
            {item.toolName}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 gap-2">
            <RequestPopoverBody request={request} toolId={item.toolId} />
          </PopoverContent>
        </Popover>
      ) : (
        <span
          className={cn("min-w-0 truncate text-xs font-medium", spent && "text-muted-foreground line-through")}
          title={item.toolName}
        >
          {item.toolName}
        </span>
      )}

      {item.toolType && item.toolType !== item.toolName && (
        <span
          className="hidden min-w-0 shrink truncate text-[11px] text-muted-foreground sm:inline"
          title={item.toolType}
        >
          {item.toolType}
        </span>
      )}

      {elsewhere && (
        <span
          className="ml-auto hidden max-w-[45%] shrink-0 truncate text-[11px] text-muted-foreground sm:inline"
          title={elsewhere}
        >
          {tone === "collect" ? "to " : sentBack ? "refused by " : "from "}
          {elsewhere}
        </span>
      )}

      {/* `ml-auto` on both: whichever is the first one visible takes the slack
          and pins the tail of the row right, including when the location above
          is display-none on a phone. */}
      <StateChip state={item.state} />
    </li>
  )
}

/** Who to ask for on site, and a way to the request itself for the rest. */
function RequestPopoverBody({ request, toolId }: { request: RequestStopInfo; toolId: string }) {
  return (
    <>
      <p className="truncate text-sm font-medium" title={request.job}>
        {request.job}
      </p>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {request.contact ? (
          <span className="flex items-center gap-1.5">
            <UserIcon className="size-3.5 shrink-0" />
            {request.contact}
          </span>
        ) : (
          <span>No contact on file</span>
        )}
        {request.contactPhone && (
          <span className="flex items-center gap-1.5">
            <PhoneIcon className="size-3.5 shrink-0" />
            {request.contactPhone}
          </span>
        )}
        {request.floor && <span>Floor {request.floor}</span>}
      </div>
      <Link href={`/requests/${request.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        View request
      </Link>
      <Link href={`/tools/${toolId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        View Tool
      </Link>
    </>
  )
}

/**
 * A transfer collect's popover: this site, and whoever its last request named.
 *
 * No "View request" link — the tool's request belongs to the site it is headed
 * to, which is exactly the confusion this popover exists to avoid.
 */
function SitePopoverBody({
  site,
  toolId,
}: {
  site: { location: string; contacts: Promise<ReadonlyMap<string, SiteContact>> }
  toolId: string
}) {
  return (
    <>
      <p className="truncate text-sm font-medium" title={site.location}>
        {site.location}
      </p>
      <Suspense fallback={<span className="text-xs text-muted-foreground">Loading contact…</span>}>
        <SiteContactLines contacts={site.contacts} location={site.location} />
      </Suspense>
      <Link href={`/tools/${toolId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        View Tool
      </Link>
    </>
  )
}

/** Nothing at all when the site has no contact on file — an empty line beats the wrong person. */
function SiteContactLines({
  contacts,
  location,
}: {
  contacts: Promise<ReadonlyMap<string, SiteContact>>
  location: string
}) {
  const contact = use(contacts).get(location)
  if (!contact) return null

  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      {contact.contact && (
        <span className="flex items-center gap-1.5">
          <UserIcon className="size-3.5 shrink-0" />
          {contact.contact}
        </span>
      )}
      {contact.contactPhone && (
        <span className="flex items-center gap-1.5">
          <PhoneIcon className="size-3.5 shrink-0" />
          {contact.contactPhone}
        </span>
      )}
    </div>
  )
}

/**
 * How far this tool has got — rendered only once it has actually been acted on,
 * so a plan reads as a plan.
 *
 * `Skipped` gets attention rather than destructive styling on purpose: nothing
 * is wrong with the tool, it is exactly where it should be, and what is notable
 * is that this trip went without it. The same call `AssignedToolRow` made for
 * the state it replaced — and `Refused` earns it for the same reason, from the
 * other side: the site said no, the tool is fine.
 *
 * `Returned` is an ok state, not an attention one. The refusal already had its
 * amber moment; by the time a tool is back in the yard the story has ended
 * tidily, which is what "Back at yard" is there to say.
 */
export function StateChip({ state }: { state?: TripToolState }) {
  if (!state || state === "Planned") return null

  const unhappy = state === "Skipped" || state === "Refused"

  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        unhappy
          ? "bg-status-attention/15 text-status-attention-foreground"
          : "bg-status-ok/15 text-status-ok-foreground"
      )}
    >
      {chipLabel(state)}
    </span>
  )
}

function chipLabel(state: TripToolState): string {
  if (state === "Dropped") return "Done"
  if (state === "Returned") return "Back at yard"
  return state
}
