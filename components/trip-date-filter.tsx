"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { XIcon } from "lucide-react"

import { formatDayLabel, parseDay } from "@/components/date-picker"
import { DateRangePicker } from "@/components/date-range-picker"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { Spinner } from "@/components/ui/spinner"

/** Same wording helper `request-search.tsx` uses for its own committed range. */
function rangeLabel(from: string, to: string) {
  const start = parseDay(from)
  const end = parseDay(to)
  if (start && end) {
    return start.getTime() === end.getTime()
      ? formatDayLabel(start)
      : `${formatDayLabel(start)} – ${formatDayLabel(end)}`
  }
  if (start) return `from ${formatDayLabel(start)}`
  if (end) return `until ${formatDayLabel(end)}`
  return null
}

/**
 * The "All trips" tab's `tripDate` filter — an explicit Apply, same idiom as
 * `request-search.tsx`'s toolbar: nothing refetches until it is pressed.
 * `from`/`to` are the *committed* range from the URL, used only to seed local
 * draft state; the page keys this component by them so navigating between
 * ranges (or Clear) remounts it with fresh state instead of needing an effect.
 */
export function TripDateFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  // Bumped to force `DateRangePicker` to remount and forget its own internal
  // range when "Clear dates" is pressed — it only re-syncs from props when its
  // popover opens.
  const [dateResetKey, setDateResetKey] = useState(0)

  const committedRange = rangeLabel(from, to)

  function apply() {
    const params = new URLSearchParams({ tab: "all" })
    if (draftFrom) params.set("from", draftFrom)
    if (draftTo) params.set("to", draftTo)
    startTransition(() => router.push(`/trips?${params}`))
  }

  function clearDates() {
    setDraftFrom("")
    setDraftTo("")
    setDateResetKey((key) => key + 1)
    startTransition(() => router.push("/trips?tab=all"))
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ButtonGroup>
          <ButtonGroupText className="text-muted-foreground">Trip date</ButtonGroupText>
          <DateRangePicker
            key={dateResetKey}
            className="w-auto max-w-full"
            placeholder="Any date"
            startDate={draftFrom}
            endDate={draftTo}
            onRangeChange={(next) => {
              setDraftFrom(next.startDate)
              setDraftTo(next.endDate)
            }}
          />
          {(draftFrom || draftTo) && (
            <Button type="button" variant="outline" size="icon" aria-label="Clear dates" onClick={clearDates}>
              <XIcon />
            </Button>
          )}
        </ButtonGroup>

        <Button type="button" variant="secondary" disabled={pending} onClick={apply}>
          {pending && <Spinner data-icon="inline-start" />}
          Apply
        </Button>
      </div>

      {committedRange && <p className="text-sm text-muted-foreground">Showing trips {committedRange}</p>}
    </div>
  )
}
