import * as React from "react"

/** Tracks an element's `offsetWidth` reactively via `ResizeObserver` — an
 *  external store, the same shape `useIsMobile` uses, so no effect mirrors a
 *  measurement into state that could drift from the DOM. */
export function useElementWidth<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const el = ref.current
      if (!el) {
        return () => {}
      }

      const observer = new ResizeObserver(onStoreChange)
      observer.observe(el)
      return () => observer.disconnect()
    },
    () => ref.current?.offsetWidth ?? 0,
    () => 0
  )
}
