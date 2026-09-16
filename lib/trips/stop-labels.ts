/**
 * The two sentences a recorded stop produces: the button's label before, and
 * the toast's description after.
 *
 * Pure and out of the component for the plain reason that both are list-joining
 * with three or five branches, and `TripStopActions` is at its size limit
 * holding two checklists and a submit. They belong together because they have to
 * agree — a button promising "drop off 2" followed by a toast saying "1 dropped"
 * reads as a bug even when it is the driver's own unticking that caused it.
 */

/** What a drop at this stop is called: `Drop off` at a job, `Return` at the yard. */
export type StopVerb = string

/**
 * `Done here — collect 3, drop off 2`.
 *
 * Counts are what will happen if the driver presses it now, so an unticked tool
 * has already been subtracted. A stop where everything has been unticked still
 * says `Done here`, because pressing it still records something: the refusals.
 */
export function stopButtonLabel(counts: { collect: number; drop: number }, verb: StopVerb): string {
  const parts = [
    counts.collect > 0 && `collect ${counts.collect}`,
    counts.drop > 0 && `${verb.toLowerCase()} ${counts.drop}`,
  ].filter(Boolean)

  return parts.length > 0 ? `Done here — ${parts.join(", ")}` : "Done here"
}

/**
 * `3 collected · 2 dropped off · 1 left behind`.
 *
 * Every outcome that actually happened, in the order a stop happens in, and
 * nothing that didn't. `returned` is spelled out as its own phrase rather than
 * folded into the drop count: a tool coming home from a site that refused it is
 * the thing the driver will want to see acknowledged.
 */
export function stopToastDescription(
  counts: { loaded: number; dropped: number; skipped: number; refused: number; returned: number },
  verb: StopVerb
): string {
  return [
    counts.loaded > 0 && `${counts.loaded} collected`,
    counts.dropped > 0 && `${counts.dropped} ${verb.toLowerCase()}`,
    counts.returned > 0 && `${counts.returned} back in the yard`,
    counts.skipped > 0 && `${counts.skipped} left behind`,
    counts.refused > 0 && `${counts.refused} refused`,
  ]
    .filter(Boolean)
    .join(" · ")
}
