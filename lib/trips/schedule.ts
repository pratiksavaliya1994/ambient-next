/**
 * When each stop happens.
 *
 * **Derived from two numbers and stored nowhere**: the trip's start time, and
 * the stop's place in the route. A `tripstop.startsAt` column would be a second
 * source of truth that starts lying the moment a stop is dragged, and every
 * drag in the builder is local state until Save — so a stored time would have
 * to be rewritten on a gesture that currently writes nothing. Same "derived,
 * never stored" call `isStopDone` makes for a stop's done-ness.
 *
 * The model is deliberately the simplest one that is useful: every stop takes
 * `STOP_DURATION_MINUTES`, and the next one starts `STOP_INTERVAL_MINUTES`
 * after this one did. There is no distance, no traffic and no per-stop
 * override, because nothing in Bubble holds any of those — this is a *plan* a
 * dispatcher reads down, not a promise anyone is held to.
 *
 * Pure and client-safe: the builder recomputes these on every drag, and the run
 * sheet renders the same numbers from a saved trip. Same split as
 * `plan-types.ts`, for the same reason.
 */

import { newYorkTimeValue } from "@/lib/bubble/dates"

/** `"HH:mm"`, New York wall clock — what the start-time picker speaks. */
export const DEFAULT_START_TIME = "06:00"

const DEFAULT_START_MINUTES = 6 * 60
const MINUTES_PER_DAY = 24 * 60

/** How long the driver is at a stop. */
export const STOP_DURATION_MINUTES = 30

/** Stop to stop, door to door — so the gap between them is the difference. */
export const STOP_INTERVAL_MINUTES = 60

/** `"HH:mm"` → minutes since midnight. Anything unparseable falls back to the default start. */
export function minutesOfTime(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  if (!match) return DEFAULT_START_MINUTES
  return Number(match[1]) * 60 + Number(match[2])
}

/** Minutes since midnight → `"HH:mm"`, wrapping rather than overflowing past midnight. */
export function timeOfMinutes(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`
}

/**
 * One stop's slot.
 *
 * `startMinutes` counts from the *trip day's* midnight and may exceed a day on
 * an absurdly long route, which is why `dayOffset` exists rather than the
 * minutes being wrapped: a route that runs past midnight should say so, not
 * quietly renumber itself back to the morning.
 */
export type StopWindow = {
  startMinutes: number
  endMinutes: number
  /** Whole days past the trip date this stop starts on. `0` for any sane route. */
  dayOffset: number
}

/** The window for the stop at `index` (0-based, route order). */
export function stopWindow(startTime: string, index: number): StopWindow {
  const startMinutes = minutesOfTime(startTime) + index * STOP_INTERVAL_MINUTES
  return {
    startMinutes,
    endMinutes: startMinutes + STOP_DURATION_MINUTES,
    dayOffset: Math.floor(startMinutes / MINUTES_PER_DAY),
  }
}

/** When the last stop is done — what the builder quotes back as a finish time. */
export function tripFinishMinutes(startTime: string, stopCount: number): number {
  if (stopCount <= 0) return minutesOfTime(startTime)
  return stopWindow(startTime, stopCount - 1).endMinutes
}

function clockParts(minutes: number): { clock: string; meridiem: string } {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hour = Math.floor(wrapped / 60)
  return {
    clock: `${hour % 12 || 12}:${String(wrapped % 60).padStart(2, "0")}`,
    meridiem: hour < 12 ? "AM" : "PM",
  }
}

/** `6:00 AM` */
export function formatClock(minutes: number): string {
  const parts = clockParts(minutes)
  return `${parts.clock} ${parts.meridiem}`
}

/**
 * `6:00 – 6:30 AM`, with the meridiem written once when both halves share it.
 *
 * Repeating it (`6:00 AM – 6:30 AM`) is a third of the string spent saying the
 * same thing twice, and these sit in a title bar next to a location that needs
 * the room.
 */
export function formatWindow(window: StopWindow): string {
  const from = clockParts(window.startMinutes)
  const to = clockParts(window.endMinutes)
  const range =
    from.meridiem === to.meridiem
      ? `${from.clock} – ${to.clock} ${to.meridiem}`
      : `${from.clock} ${from.meridiem} – ${to.clock} ${to.meridiem}`
  return window.dayOffset > 0 ? `${range} +${window.dayOffset}d` : range
}

/**
 * `6AM–6:30AM` — the same window with every character that isn't information
 * taken out: no `:00` on a whole hour, no space before the meridiem, and a
 * dash with nothing either side.
 *
 * For the run sheet's rail, which is a narrow column beside a card that wants
 * the rest of the width. The spelled-out `formatWindow` wraps to two lines
 * there, and a stop's time broken across lines stops reading as one range —
 * this fits on one at every hour of the day, the noon crossing included.
 */
export function formatWindowCompact(window: StopWindow): string {
  const compact = (minutes: number) => {
    const parts = clockParts(minutes)
    return `${parts.clock.replace(/:00$/, "")}${parts.meridiem}`
  }
  const range = `${compact(window.startMinutes)}–${compact(window.endMinutes)}`
  return window.dayOffset > 0 ? `${range} +${window.dayOffset}d` : range
}

/**
 * A saved `trip.tripDate` back to the `"HH:mm"` the picker speaks.
 *
 * **Midnight reads as "no time was ever chosen".** Trips planned before a start
 * time existed were written as New York midnight, and the picker offers no
 * midnight slot, so `00:00` is always one of those rows rather than somebody's
 * real 12 AM departure. Showing them a 12:00 AM first stop would be a confident
 * lie; showing the default is at worst a guess that matches every other trip.
 */
export function tripStartTime(iso: string | null | undefined): string {
  const time = newYorkTimeValue(iso)
  return time === null || time === "00:00" ? DEFAULT_START_TIME : time
}
