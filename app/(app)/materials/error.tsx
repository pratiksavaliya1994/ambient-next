"use client"

import { AlertCircleIcon, RotateCcwIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/**
 * Every `/materials` route's error state. The usual cause is Bubble — a failed
 * or rate-limited read — so the one useful action is to try the read again.
 */
export default function MaterialsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Couldn&rsquo;t load the materials</AlertTitle>
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
