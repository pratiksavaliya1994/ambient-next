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
 * Surfaces a native-install nudge. Chrome/Edge/Android fire `beforeinstallprompt`
 * and get a real one-tap install; iOS Safari never fires that event, so it gets
 * "Share → Add to Home Screen" instructions instead — there's no programmatic
 * install path on iOS.
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

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  async function install() {
    if (!deferredPrompt) {
      return
    }

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === "accepted") {
      setDismissed(true)
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
              ? "Tap Share, then \"Add to Home Screen\" to open Ambient like an app."
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
