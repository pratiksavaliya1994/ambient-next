"use client"

import { useRef, useState, useTransition } from "react"

import { listSiteStockAction } from "@/app/(app)/requests/new/pickup/site-stock-action"
import type { SiteItem } from "@/lib/bubble/site-stock-types"

/**
 * The pickup form's site hint (5G §1): what the picked job has been sent and
 * not sent back, by catalogue item. **A hint, never a limit** — nothing is
 * added to the form, nothing is enforced.
 *
 * Read from the job field's change handler, which is the event, so there's no
 * `useEffect`. Changing the job clears the hint and re-reads it. A slower
 * answer for a job that is no longer picked is dropped, so a quick second
 * pick can't be overwritten by the first. A failed read just hides the hint.
 */
export type SiteStockHint = {
  /** `null` while there's nothing to show: no job, still loading, or the read failed. */
  items: SiteItem[] | null
  pending: boolean
  /** The job the hint is for, once read. */
  job: string | null
}

export function useSiteStockHint() {
  const [items, setItems] = useState<SiteItem[] | null>(null)
  const [job, setJob] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const latest = useRef<string | null>(null)

  function load(jobName: string | null) {
    latest.current = jobName
    setItems(null)
    setJob(null)
    if (!jobName) return

    startTransition(async () => {
      const read = await listSiteStockAction(jobName).catch(() => null)
      if (latest.current !== jobName) return
      setItems(read)
      setJob(read ? jobName : null)
    })
  }

  const hint: SiteStockHint = { items, pending, job }
  return { hint, load }
}
