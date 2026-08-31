/**
 * The Bubble app is a New York operation and every date in it is a New York
 * wall-clock date: `requestDate` is midnight Eastern on the delivery day, and
 * `searchable` ends in an Eastern timestamp. Node runs in whatever zone the
 * host has, so the conversion is done explicitly rather than with `Date`'s
 * local-time methods.
 *
 * `Intl` is the only timezone database available without a dependency.
 */

const TZ = "America/New_York"

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

const STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "numeric",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

function partsOf(formatter: Intl.DateTimeFormat, at: Date) {
  return Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, part.value])) as Record<
    string,
    string
  >
}

/** How far Eastern wall-clock time is ahead of UTC at a given instant. */
function offsetMs(at: Date) {
  const p = partsOf(PARTS, at)
  // `hour12: false` renders midnight as 24 in some ICU versions.
  const asIfUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second)
  )
  return asIfUTC - at.getTime()
}

/**
 * The instant at which it is `hours:minutes` in New York on `day` (`yyyy-mm-dd`).
 *
 * Resolved in two passes: the first guess uses the offset at the wrong instant,
 * which is off by an hour for the few hours either side of a DST change, and
 * the second pass re-reads the offset at the corrected instant.
 */
export function newYorkInstant(day: string, hours = 0, minutes = 0): Date {
  const [year, month, date] = day.split("-").map(Number)
  const wallClock = Date.UTC(year, month - 1, date, hours, minutes)

  const firstPass = wallClock - offsetMs(new Date(wallClock))
  return new Date(wallClock - offsetMs(new Date(firstPass)))
}

/** `8-24-2026 2:56 am` — the tail of every `request.searchable` value. */
export function newYorkStamp(at: Date): string {
  const p = partsOf(STAMP, at)
  return `${p.month}-${p.day}-${p.year} ${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`
}

const LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

/** Null for a missing or unparseable value, so each label can say "—" itself. */
function labelParts(iso: string | null | undefined) {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return partsOf(LABEL, at)
}

/** `Mon 8-24` — the calendar half of a request's slot. */
export function newYorkDayLabel(iso: string | null | undefined): string {
  const p = labelParts(iso)
  return p ? `${p.weekday} ${p.month}-${p.day}` : "—"
}

/** `Mon 8-24` for a single day, `Mon 8-24 – Wed 8-26` when the range spans more than one. */
export function newYorkRangeLabel(startIso: string | null | undefined, endIso: string | null | undefined): string {
  const start = newYorkDayLabel(startIso)
  const end = newYorkDayLabel(endIso)
  if (start === "—") return end
  if (end === "—" || end === start) return start
  return `${start} – ${end}`
}

/** `9:00 am` — the clock half of a request's slot. */
export function newYorkTimeLabel(iso: string | null | undefined): string {
  const p = labelParts(iso)
  return p ? `${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}` : "—"
}

/** `Mon 8-24, 9:00 am` — both halves, where only one line is available. */
export function newYorkLabel(iso: string | null | undefined): string {
  const p = labelParts(iso)
  if (!p) return "—"
  return `${p.weekday} ${p.month}-${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`
}

/** Today in New York as `yyyy-mm-dd`, for defaulting the date input. */
export function newYorkToday(): string {
  const p = partsOf(PARTS, new Date())
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * `days` days before today in New York, as `yyyy-mm-dd`.
 *
 * Plain calendar arithmetic on a UTC date rather than subtracting 24h from an
 * instant, so a DST changeover day — 23 or 25 hours long — still steps back
 * exactly one calendar day.
 */
export function newYorkDaysAgo(days: number): string {
  const [year, month, date] = newYorkToday().split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10)
}

/** `Tuesday 9-3` — the date line in the WhatsApp summary. */
export function newYorkWeekday(iso: string | null | undefined): string {
  if (!iso) return "—"
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return "—"

  const p = partsOf(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "long",
      month: "numeric",
      day: "numeric",
    }),
    at
  )
  return `${p.weekday} ${p.month}-${p.day}`
}
