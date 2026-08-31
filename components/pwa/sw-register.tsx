"use client"

import { useEffect } from "react"

/**
 * Registers `public/sw.js`. Side-effecting browser API — no way to do this
 * outside an effect.
 *
 * Production only: the SW caches `/_next/static/*` cache-first, which fights
 * Turbopack's dev-mode HMR — a stale-cached chunk can reference an export
 * (e.g. an icon) that a later edit removed, breaking the client bundle until
 * the cache is cleared. In dev this actively unregisters/clears instead, so a
 * browser that picked up the SW during development self-heals on next load.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return
    }

    if (process.env.NODE_ENV !== "production") {
      // The page that got here may itself have been served from the stale
      // cache, so clear everything and reload once. `controller` is only set
      // when a worker actually served this load, and unregistering clears it
      // for the next one — so this can't loop.
      const wasControlled = Boolean(navigator.serviceWorker.controller)

      Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.all(registrations.map((r) => r.unregister()))),
        "caches" in window
          ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          : Promise.resolve(),
      ]).then(() => {
        if (wasControlled) {
          window.location.reload()
        }
      })

      return
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline-capability is a nice-to-have; a failed registration shouldn't be user-visible.
    })
  }, [])

  return null
}
