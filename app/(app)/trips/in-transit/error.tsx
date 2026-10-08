"use client"

import { AlertCircleIcon, RotateCcwIcon } from "lucide-react"
import * as React from "react"

import { AUTO_REFRESH_MS } from "@/components/auto-refresh"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/**
 * The In Transit dashboard's error state — `materials/error.tsx`'s idiom. It
 * runs unattended on a wall screen and this boundary replaces the page's
 * `<AutoRefresh />`, so it retries on its own after one refresh interval;
 * otherwise one Bubble hiccup would freeze the screen on this message. An
 * effect because the retry is a timer, which has no render-time equivalent.
 */
export default function InTransitError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  React.useEffect(() => {
    const id = window.setTimeout(() => unstable_retry(), AUTO_REFRESH_MS)
    return () => window.clearTimeout(id)
  }, [unstable_retry])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Couldn&rsquo;t load what&rsquo;s in transit</AlertTitle>
        <AlertDescription>{error.message || "Bubble didn't answer. Try again in a moment."}</AlertDescription>
      </Alert>
      <div>
        <Button variant="outline" size="sm" onClick={() => unstable_retry()}>
          <RotateCcwIcon />
          Try again
        </Button>
      </div>
    </div>
  )
}
