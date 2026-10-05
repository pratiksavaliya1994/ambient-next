"use client"

import { useState } from "react"

/**
 * What the driver has said at one stop, before pressing Done: the rows they
 * unticked, and what they counted for each pickup line (5G).
 *
 * The **exceptions**, not the checked set itself — an id lands in `unticked`
 * only once the driver unticks it. Everything else defaults to checked, which
 * matters because `TripStopActions` doesn't remount between stops: it stays
 * mounted across every live stop as `work` is refetched after each action, and
 * a row can join the drops only after it's actually been collected upstream.
 * Deriving the lists fresh each render means a newly-outstanding row is
 * checked the moment it shows up, with no effect needed to resync it.
 *
 * Counts hold only what the driver **changed**: a line nobody touched counts
 * as its estimate (`stopChecklist` fills it in), so a stop that went to plan
 * is one press. `null` is a field the driver cleared — unanswered, and the
 * button waits for it. A count for a line no longer outstanding is simply
 * never read.
 */
export function useStopChoices() {
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set())
  const [counts, setCounts] = useState<Map<string, number | null>>(() => new Map())

  function toggle(id: string, on: boolean) {
    setUnticked((current) => {
      const next = new Set(current)
      // "on" means checked (delivered/collected), so being ticked back on
      // clears the exception rather than recording one.
      if (on) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setCount(lineId: string, count: number | null) {
    setCounts((current) => new Map(current).set(lineId, count))
  }

  return { unticked, counts, toggle, setCount }
}
