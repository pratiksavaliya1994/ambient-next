"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

/** How often a dashboard re-reads Bubble. The client puts these on wall
 *  screens, so a change should show up without anyone touching the page. */
export const AUTO_REFRESH_MS = 15_000

/**
 * Re-runs the page's server components on a timer, so a dashboard left open
 * keeps showing live data.
 *
 * `router.refresh()` rather than a reload: the new server render is merged in
 * place, so client state — filters, search, fullscreen, scroll position —
 * survives and there's no blank flash between reads. Skipped while the tab is
 * hidden, so a background tab doesn't keep costing Bubble reads.
 *
 * An effect because a timer is a subscription to something outside React —
 * there's no render-time way to do this.
 */
export function AutoRefresh({ intervalMs = AUTO_REFRESH_MS }: { intervalMs?: number }) {
  const router = useRouter()

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [router, intervalMs])

  return null
}
