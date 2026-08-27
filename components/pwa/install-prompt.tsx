"use client"

import { useEffect, useState } from "react"
import { DownloadIcon, Share2Icon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardTitle } from "@/components/ui/card"

const DISMISS_KEY = "pwa-install-dismissed-at"
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari on iOS has no display-mode media query support; it exposes this instead.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function wasRecentlyDismissed() {
  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
  return Date.now() - dismissedAt < SNOOZE_MS
}

/**
 * A supplementary install nudge. It deliberately **never calls
 * `preventDefault()` on `beforeinstallprompt`** — doing so suppresses the
 * browser's own install UI, and the Next.js PWA guide recommends letting the
 * browser prompt automatically rather than replacing it. So the native prompt
 * (Chrome's omnibox install icon / Android's infobar) always stays intact, and
 * this card is only ever an extra affordance on top of it:
 *
 * - iOS Safari never fires `beforeinstallprompt` and has no automatic prompt,
 *   so it gets "Share → Add to Home Screen" instructions — the only path there.
 * - Elsewhere, if the event is captured before this mounts we offer a one-tap
 *   Install button. If it fired before hydration we simply render nothing and
 *   the browser's own prompt does the job.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) {
      return
    }

    if (isIos()) {
      setShowIosHint(true)
      return
    }

    // No preventDefault: the browser keeps showing its own install UI.
    function onBeforeInstallPrompt(event: Event) {
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    function onInstalled() {
      setDeferredPrompt(null)
      setDismissed(true)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  async function install() {
    if (!deferredPrompt) {
      return
    }

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        setDismissed(true)
      }
    } catch {
      // The browser may have already consumed its own prompt — nothing to add.
    } finally {
      setDeferredPrompt(null)
    }
  }

  if (dismissed || (!deferredPrompt && !showIosHint)) {
    return null
  }

  return (
    <Card className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm shadow-lg sm:right-4 sm:left-auto">
      <CardContent className="flex-row items-start gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <CardTitle>Install Ambient</CardTitle>
          <CardDescription>
            {showIosHint
              ? 'Tap Share, then "Add to Home Screen" to open Ambient like an app.'
              : "Add Ambient to your home screen for a faster, full-screen experience."}
          </CardDescription>
          {!showIosHint && (
            <Button size="sm" className="mt-2 self-start" onClick={install}>
              <DownloadIcon /> Install
            </Button>
          )}
          {showIosHint && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Share2Icon className="size-3.5" /> Share menu → Add to Home Screen
            </div>
          )}
        </div>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss install prompt" onClick={dismiss}>
            <XIcon />
          </Button>
        </CardAction>
      </CardContent>
    </Card>
  )
}
