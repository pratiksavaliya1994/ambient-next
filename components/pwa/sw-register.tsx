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
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister())
      })
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)))
      }
      return
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline-capability is a nice-to-have; a failed registration shouldn't be user-visible.
    })
  }, [])

  return null
}
