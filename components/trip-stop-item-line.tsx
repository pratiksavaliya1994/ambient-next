import type { TripToolState } from "@/lib/trips/plan-types"
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
export function TripStopItemLine({ item, tone }: { item: StopItem; tone: StopItemTone }) {
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
    <li className={cn("flex items-center gap-2 px-2 py-1.5", spent && "bg-status-attention/5")}>
      <span
        className={cn("min-w-0 truncate text-xs font-medium", spent && "text-muted-foreground line-through")}
        title={item.toolName}
      >
        {item.toolName}
      </span>

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
function StateChip({ state }: { state?: TripToolState }) {
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
