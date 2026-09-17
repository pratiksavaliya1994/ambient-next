import { LockIcon, TriangleAlertIcon, UnlockIcon } from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { TripFlag } from "@/lib/trips/plan-types"
import type { ToolHold } from "@/lib/tools/tool-edit"

/**
 * The three things the tool detail page has to say about *why* its movement
 * fields are in the state they're in. All presentational and server-rendered —
 * the form island below them stays as small as possible.
 */

/**
 * Why `location`, `floor` and the release control are disabled, and where to go
 * to change that.
 *
 * Always names the holder and always links to it: "locked" with no next step is
 * the kind of dead end that sends someone into Bubble to edit the row by hand,
 * which is the exact thing this page exists to stop.
 */
export function ToolHoldNotice({ hold }: { hold: ToolHold }) {
  const [title, description, href, linkText] =
    hold.kind === "trip"
      ? [
          hold.started
            ? `Out on ${hold.driver ?? "a driver"}'s trip`
            : `Planned onto ${hold.driver ?? "a driver"}'s trip`,
          hold.started
            ? "Updates on its own as the trip continues."
            : "Remove it from that trip before making changes here.",
          `/trips/${hold.tripId}`,
          "Open the trip",
        ]
      : [
          `Assigned to ${hold.job}`,
          "Remove it from that request before making changes here.",
          `/requests/${hold.requestId}`,
          "Open the request",
        ]

  return (
    <Alert>
      <LockIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}{" "}
        <Link href={href} className="font-medium text-foreground">
          {linkText}
        </Link>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Nothing holds the tool, but `statusNew` still reads as though something does
 * — a cancelled trip, a half-landed assign write, an old-Bubble-UI edit.
 *
 * Worth an explicit callout rather than just quietly enabling the switch: the
 * tool has silently dropped out of every picker in the app (`isFreeToAssign` is
 * false for it), and that is invisible from anywhere else.
 */
export function ToolOrphanNotice({ status }: { status: string }) {
  return (
    <Alert>
      <UnlockIcon />
      <AlertTitle>Marked &quot;{status || "blank"}&quot;, but nothing is using it</AlertTitle>
      <AlertDescription>Use the switch below to make it available again.</AlertDescription>
    </Alert>
  )
}

/**
 * What the last trip to touch this tool decided about it — read from
 * `triptool.state` via `listTripFlags`, which is the only place either fact
 * exists.
 *
 * A **refusal** in particular is invisible in `tools` altogether: the drop
 * never happened, so the row comes home reading `Available` at the warehouse,
 * indistinguishable from a tool that never left. Anyone looking at this page to
 * work out why a tool is where it is needs that sentence.
 */
export function ToolTripFlagNotice({ flag }: { flag: TripFlag }) {
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertTitle>{flag === "refused" ? "Turned away at the last stop" : "Not picked up on the last trip"}</AlertTitle>
      <AlertDescription>
        {flag === "refused"
          ? "It came back on the truck — check its location below."
          : "It's still at its last known location."}
      </AlertDescription>
    </Alert>
  )
}
