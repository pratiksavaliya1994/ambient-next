/**
 * The two sentences a recorded stop produces: the button's label before, and
 * the toast's description after.
 *
 * Pure and out of the component for the plain reason that both are list-joining
 * with three or five branches, and `TripStopActions` is at its size limit
 * holding two checklists and a submit. They belong together because they have to
 * agree — a button promising "drop off 2" followed by a toast saying "1 dropped"
 * reads as a bug even when it is the driver's own unticking that caused it.
 *
 * Tools alone read as they always have ("collect 3"). Once material lines are
 * involved each count names its kind ("drop off 3 tools, 2 materials").
 */

/** What a drop at this stop is called: `Drop off` at a job, `Return` at the yard. */
export type StopVerb = string

/** `3`, `2 materials`, or `3 tools, 2 materials`. Empty when both are zero. */
function cargo(tools: number, materials: number): string {
  const lines = materials > 0 ? `${materials} ${materials === 1 ? "material" : "materials"}` : ""
  if (tools === 0) return lines
  if (!lines) return String(tools)
  return `${tools} ${tools === 1 ? "tool" : "tools"}, ${lines}`
}

/**
 * `Done here — collect 3, drop off 2 tools, 1 material`.
 *
 * Counts are what will happen if the driver presses it now, so an unticked row
 * has already been subtracted. A stop where everything has been unticked still
 * says `Done here`, because pressing it still records something: the refusals.
 */
export function stopButtonLabel(
  counts: { collect: number; drop: number; collectMaterials?: number; dropMaterials?: number },
  verb: StopVerb
): string {
  const collect = cargo(counts.collect, counts.collectMaterials ?? 0)
  const drop = cargo(counts.drop, counts.dropMaterials ?? 0)
  const parts = [collect && `collect ${collect}`, drop && `${verb.toLowerCase()} ${drop}`].filter(Boolean)
  // A comma already sits inside "3 tools, 2 materials", so the halves need a stronger break.
  const separator = counts.collectMaterials || counts.dropMaterials ? "; " : ", "

  return parts.length > 0 ? `Done here — ${parts.join(separator)}` : "Done here"
}

type OutcomeCounts = {
  loaded: number
  dropped: number
  skipped: number
  refused: number
  returned: number
  materialsLoaded?: number
  materialsDropped?: number
  materialsSkipped?: number
  materialsRefused?: number
  materialsReturned?: number
  /** Pickup lines counted at their collect (5F) — collected, like `materialsLoaded`. */
  materialsCounted?: number
  /** Pickup lines unloaded at the yard (5F) — dropped there, like `materialsDropped`. */
  materialsLanded?: number
}

/**
 * `3 collected · 2 dropped off · 1 left behind`.
 *
 * Every outcome that actually happened, in the order a stop happens in, and
 * nothing that didn't. `returned` is spelled out as its own phrase rather than
 * folded into the drop count: a tool coming home from a site that refused it is
 * the thing the driver will want to see acknowledged.
 */
export function stopToastDescription(counts: OutcomeCounts, verb: StopVerb): string {
  const phrase = (tools: number, materials: number | undefined, words: string) => {
    const count = cargo(tools, materials ?? 0)
    return count && `${count} ${words}`
  }

  const sum = (a?: number, b?: number) => (a ?? 0) + (b ?? 0)

  return [
    phrase(counts.loaded, sum(counts.materialsLoaded, counts.materialsCounted), "collected"),
    phrase(counts.dropped, sum(counts.materialsDropped, counts.materialsLanded), verb.toLowerCase()),
    phrase(counts.returned, counts.materialsReturned, "back in the yard"),
    phrase(counts.skipped, counts.materialsSkipped, "left behind"),
    phrase(counts.refused, counts.materialsRefused, "refused"),
  ]
    .filter(Boolean)
    .join(" · ")
}
