// Minimal service worker: enables PWA installability and caches the static
// app shell (Next's hashed chunks + icons) so repeat visits are instant and
// the app can still open offline. Everything else (pages, server actions,
// the Bubble-backed data) always goes to the network — this app has no
// business serving stale job/request data from a cache.
const CACHE_NAME = "ambient-static-v2"

// Dev chunk URLs are not content-hashed, so a cached one goes stale the moment
// a file is edited and the app dies with "module factory is not available".
// A worker that finds itself on a dev origin — installed before the register
// guard existed, or carried over from a local production build — clears up
// after itself instead of serving anything.
const IS_DEV_ORIGIN = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname)

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => IS_DEV_ORIGIN || key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => (IS_DEV_ORIGIN ? self.registration.unregister() : undefined))
      .then(() => self.clients.claim())
  )
})

function isStaticAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon") || url.pathname.startsWith("/apple-icon"))
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (IS_DEV_ORIGIN || request.method !== "GET") {
    return
  }

  const url = new URL(request.url)
  if (!isStaticAsset(url)) {
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) {
        return cached
      }

      const response = await fetch(request)
      if (response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
  )
})
