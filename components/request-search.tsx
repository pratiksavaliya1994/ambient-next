"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { SearchIcon, XIcon } from "lucide-react"

import { formatDayLabel, parseDay } from "@/components/date-picker"
import { DateRangePicker } from "@/components/date-range-picker"
import { Button, buttonVariants } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

/**
 * How to read a committed date range back as prose. `DateRangePicker` only
 * commits both ends at once, but the URL can arrive carrying one — a
 * hand-edited or older `/requests?from=…` link — so each half-open form gets
 * its own wording rather than being dropped from the summary.
 */
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
 * The requests list's search toolbar — an explicit action, not a live filter:
 * nothing is fetched until Search is pressed (or Enter, since this is a real
 * `<form>`), same idiom as `tools-dashboard.tsx`'s search box.
 *
 * `query`/`from`/`to` are the *committed* search from `/requests`'s URL, used
 * only to seed local draft state. The page keys this component by those same
 * three values, so a browser back/forward or the "Clear search" link remounts
 * it with fresh state instead of needing an effect to resync it.
 */
export function RequestSearchBar({ query, from, to }: { query: string; from: string; to: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [draftQuery, setDraftQuery] = useState(query)
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  // Bumped only to force `DateRangePicker` to remount and forget its own
  // internal range when "Clear dates" is pressed — it only re-syncs from
  // props when its popover opens.
  const [dateResetKey, setDateResetKey] = useState(0)

  const isSearching = Boolean(query.trim() || from || to)
  // The *committed* search, for the summary line — the drafts above describe
  // what is being typed, these describe what is actually on screen.
  const committedQuery = query.trim()
  const committedRange = rangeLabel(from, to)

  function runSearch(event: React.FormEvent) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (draftQuery.trim()) params.set("q", draftQuery.trim())
    if (draftFrom) params.set("from", draftFrom)
    if (draftTo) params.set("to", draftTo)
    const target = params.size > 0 ? `/requests?${params}` : "/requests"
    startTransition(() => router.push(target))
  }

  function clearDates() {
    setDraftFrom("")
    setDraftTo("")
    setDateResetKey((key) => key + 1)
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <form onSubmit={runSearch} className="flex w-full min-w-0 flex-wrap items-center gap-2">
        {/* `basis-64` with `min-w-0` rather than a `min-w-*` floor: the input
            asks for a comfortable width and wraps to its own line when the row
            runs out of room, instead of holding a width the row can't afford
            and pushing the controls beside it into a horizontal scroll. */}
        <InputGroup className="min-w-0 flex-1 basis-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Search job, PM, contact or floor"
          />
          {draftQuery && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                size="icon-xs"
                aria-label="Clear search text"
                onClick={() => setDraftQuery("")}
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        {/* Date range, Search and "Clear search" travel as one block so they
            wrap onto a line together rather than one button at a time — and so
            "Clear dates" can never end up rendered on top of "Clear search". */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* The range constrains `requestDateStart` — the drop/pickup date the
              cards lead with — not when the row was typed in, so the control
              carries that label rather than leaving "a date range" to be read
              either way. `ButtonGroup` joins label, trigger and clear button
              into one field, so "Clear dates" reads as belonging to the date
              and can't be mistaken for the "Clear search" that drops
              everything. */}
          <ButtonGroup>
            <ButtonGroupText className="text-muted-foreground">Drop / pickup</ButtonGroupText>
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

          {/* Secondary rather than the primary fill the "New request" buttons
              use: Search commits the toolbar, so it needs to stand apart from
              the date controls beside it without reading as a third way to
              create something. */}
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <SearchIcon data-icon="inline-start" />}
            Search
          </Button>

          {isSearching && (
            <Link href="/requests" className={buttonVariants({ variant: "ghost" })}>
              Clear search
            </Link>
          )}
        </div>
      </form>

      {/* What the results on screen actually answer to. Reads off the
          committed props, not the drafts, so editing the box without pressing
          Search never makes this line lie about what is listed below. Says
          "scheduled" for the same reason the control says "Drop / pickup":
          the range is the drop/pickup date, not the creation date. */}
      {(committedQuery || committedRange) && (
        <p className="text-sm text-muted-foreground">
          Showing requests{" "}
          {committedQuery && (
            <>
              matching <span className="font-medium text-foreground">&ldquo;{committedQuery}&rdquo;</span>
            </>
          )}
          {committedQuery && committedRange && ", "}
          {committedRange && (
            <>
              scheduled <span className="font-medium text-foreground">{committedRange}</span>
            </>
          )}
        </p>
      )}
    </div>
  )
}
