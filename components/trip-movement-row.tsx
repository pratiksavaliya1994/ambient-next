"use client"

import { ArrowRightIcon, TriangleAlertIcon, TruckIcon } from "lucide-react"

import { CargoKindIcon } from "@/components/cargo-kind"
import { ToolStateBadges } from "@/components/tool-status-badges"
import { Checkbox } from "@/components/ui/checkbox"
import type { OutstandingMovement } from "@/lib/trips/movement-types"
import { cn } from "@/lib/utils"

/**
 * One tool waiting to be moved, in the builder's pool.
 *
 * The row is a **movement**, not a tool — which is why it reads
 * `origin → destination` rather than just naming a location. That is the whole
 * shift this phase makes: the thing being dispatched is a journey. The two ends
 * are chips rather than bare text so the arrow between them lands as a
 * direction instead of punctuation.
 *
 * **The whole row is the hit target**, not just the checkbox — picking twenty
 * tools by aiming at a 16px square is the kind of thing that makes a dispatcher
 * stop using the screen. The checkbox stops the click propagating so a direct
 * hit on it doesn't toggle twice, and it stays a real checkbox so keyboard and
 * screen-reader users get the control they expect. Same shape as the pickup
 * picker's clickable `ItemContent`.
 *
 * `journey` is where the trip is **actually** taking this tool, which is not
 * always where this row's own request was sending it: ticking a tool that a
 * pickup and a delivery both name collapses the two legs into one drive to the
 * job (`oneJourney`), and the warehouse this pickup group is pointed at never
 * gets visited. The row says so rather than leaving the route panel to
 * contradict it — a dispatcher reading "→ Warehouse" here and a job stop over
 * there has no way to tell which one the save will believe.
 *
 * A tool blocked by its **condition** is shown disabled rather than hidden,
 * with the reason — "Broken" is something the warehouse manager can act on from
 * here, the same call `DispatchRequestRow` made about unavailable requests.
 * Only a *delivery* row can be blocked that way now: a pickup collects a tool
 * whatever state it is in, which is the point of a pickup. So the pairing this
 * row has to render honestly is a site-to-site transfer whose tool is unfit for
 * the job — the pickup half travels, the delivery half is blocked, and the
 * blocked row keeps its **own** destination on the chip and says where the tool
 * is really going in the reason line. Letting `journey` rewrite the arrow there
 * would have shown a row reading `→ Warehouse` under a job heading, with a
 * "skips this job" note that reads as a routing shortcut rather than a refusal.
 * A
 * tool another trip has already claimed never reaches this row at all:
 * `shownMovements` drops it upstream, because its fix lives on that other trip
 * and a red dead row is only noise in a list scanned twenty tools deep. The
 * claimed branch below stays as a backstop for any caller that skips that
 * filter.
 */
export function TripMovementRow({
  movement,
  destination,
  journey,
  checked,
  onCheckedChange,
}: {
  movement: OutstandingMovement
  /** The group's destination — a pickup's is chooseable, so it can differ from `movement.to`. */
  destination: string
  /** Where the current selection actually sends this tool, when it is ticked. */
  journey?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const blocked = movement.block !== null
  const goingTo = blocked ? destination : (journey ?? destination)
  const rerouted = journey !== undefined && journey !== destination
  const diverted = rerouted && !blocked

  return (
    <li
      onClick={() => !blocked && onCheckedChange(!checked)}
      className={cn(
        "flex items-start gap-2 rounded-md border border-l-4 px-2 py-1.5 transition-colors",
        blocked
          ? "border-l-destructive bg-destructive/5"
          : checked
            ? "cursor-pointer border-l-primary bg-primary/5"
            : "cursor-pointer border-l-foreground/25 bg-background hover:bg-muted/60"
      )}
    >
      {/* Stops a direct hit on the checkbox toggling it a second time via the row. */}
      <span className="mt-0.5 flex shrink-0" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={checked}
          disabled={blocked}
          onCheckedChange={(next) => onCheckedChange(next === true)}
          aria-label={movement.toolName}
        />
      </span>
      <CargoKindIcon kind="tool" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-xs font-medium" title={movement.toolName}>
            {movement.toolName}
          </p>
          {/* Condition *and* status, not the bare status this used to show. A
              pickup no longer blocks on condition, so "Under Repair" is now
              something the row has to carry itself — it is half of why the
              tool is being collected, and the driver is about to load it. */}
          {!blocked && (
            <ToolStateBadges
              status={movement.tool.status}
              condition={movement.tool.condition}
              className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
            />
          )}
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
          <span
            className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
            title={movement.from}
          >
            {movement.from}
          </span>
          <ArrowRightIcon className="size-3.5 shrink-0 text-foreground/60" />
          <span
            className="max-w-full truncate rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
            title={goingTo}
          >
            {goingTo}
          </span>
        </p>

        {diverted && <p className="mt-1 text-[11px] text-muted-foreground">Direct transfer — skips {destination}.</p>}

        {blocked && <BlockReason movement={movement} instead={rerouted ? journey : undefined} />}
      </div>
    </li>
  )
}

function BlockReason({
  movement,
  /** Where the trip is taking this tool anyway, on another request's leg. */
  instead,
}: {
  movement: OutstandingMovement
  instead?: string
}) {
  if (movement.block?.kind === "claimed") {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
        <TruckIcon className="size-3 shrink-0" />
        Already on {movement.block.driver ?? "another"}&rsquo;s trip
      </p>
    )
  }

  return (
    <>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
        <TriangleAlertIcon className="size-3 shrink-0" />
        Not available — {movement.block?.detail}
      </p>
      {instead && <p className="mt-1 text-[11px] text-muted-foreground">Going back to {instead} instead.</p>}
    </>
  )
}
