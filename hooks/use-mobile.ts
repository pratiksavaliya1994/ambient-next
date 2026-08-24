import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * Reworked from the shadcn version, which seeded the state from an effect and
 * so tripped `react-hooks/set-state-in-effect`. `useSyncExternalStore` reads
 * the media query during render instead, which also removes the first paint
 * where the value was still `undefined`.
 *
 * The server snapshot is `false`: there is no viewport to measure during SSR,
 * and the desktop sidebar is the markup that degrades gracefully — the mobile
 * sheet needs an open/closed state that only exists in the browser.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
