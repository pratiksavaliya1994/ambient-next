import {
  isFreeToAssign,
  TOOL_STATUS_ASSIGNED,
  TOOL_STATUS_AVAILABLE,
  TOOL_STATUS_IN_TRANSIT,
} from "@/lib/bubble/tool-enums"

/**
 * What the tool detail page is allowed to change, and why.
 *
 * Pure and client-safe, beside `list-filters.ts` — the page renders the
 * controls off `editabilityOf`, and `updateToolAction` re-runs the same
 * function against a fresh read immediately before the write. One function, so
 * a disabled input and a refused save can never disagree about the rule.
 *
 * **The gate is claim-based, not status-based**, because `tools.statusNew` is a
 * lagging indicator and lies in both directions:
 *
 * - A **refused** tool reads `statusNew = "Available"` at `location =
 *   "Warehouse"` while it is still physically on the truck — the drop simply
 *   never happened, so nothing in `tools` records it (see `listTripFlags`).
 *   Only its `triptool` row knows, and `isLiveClaim` counts `Refused`.
 * - An **orphaned** tool reads `Assigned` or `In Transit` with no
 *   `assignedtools` or `triptool` row behind it — a cancelled trip, a
 *   half-landed assign write, an old-Bubble-UI edit. `isFreeToAssign` is false
 *   for it, so it has dropped out of every picker in the app with no screen
 *   able to put it back. Freeing exactly these is what this page is for, and a
 *   status test would lock it out forever.
 *
 * So "is anything holding this tool" is asked of the two tables that actually
 * hold claims, and `statusNew` is treated as the thing being repaired rather
 * than as evidence about itself.
 *
 * **On top of that, `Assigned` and `In Transit` lock the location by status
 * alone** (`isStatusLocked`), even with no claim behind them. Moving such a
 * tool by hand would leave the request or trip that set the status pointing at
 * the wrong place. An orphan is still freed here, but in two steps: release it
 * to `Available` (the switch stays offered), save, then fix where it is.
 */

/** `statusNew` values whose location only a request or trip may change. */
export function isStatusLocked(status: string): boolean {
  return status === TOOL_STATUS_ASSIGNED || status === TOOL_STATUS_IN_TRANSIT
}

/** One tool, with every field the detail page reads or writes. */
export type ToolDetail = {
  id: string
  name: string
  /** `toolstype._id` — a real link, unlike every other field here. */
  typeId: string | null
  typeName: string | null
  /** **Raw and trimmed**, not `NO_LOCATION`: this value gets written back. Empty when unset. */
  location: string
  floor: string
  /** Static shelf/bin in the warehouse. Not gated by `ToolEditability` — it never moves with the tool. */
  warehouseLocation: string
  /** `tools.statusNew`. Empty means the phase 2 backfill missed the row. */
  status: string
  condition: string
  currentUser: string
  /**
   * `tools.photos` — file-manager URLs, **protocol-relative** as Bubble stores
   * them. Not part of `ToolEditability` below: a photo identifies the tool, so
   * it stays editable whatever is holding it. See `lib/tools/tool-photos.ts`.
   */
  photos: string[]
}

/**
 * Whatever currently has a live claim on the tool. A trip outranks a request
 * when both do — it is the harder block and the one with somewhere to go fix
 * it, and a dispatched request's tools are held by both by construction.
 */
export type ToolHold =
  | { kind: "trip"; tripId: string; driver: string | null; started: boolean }
  | { kind: "request"; requestId: string; job: string; pickup: boolean }

export type ToolEditability = {
  /** No live claim and not `isStatusLocked`, so `location` / `floor` unlock. */
  movable: boolean
  /** The claim locking them, if one does. */
  hold: ToolHold | null
  /** Unclaimed, but `statusNew` is `Assigned`/`In Transit`, which locks them too. */
  statusLocked: boolean
  /**
   * Whether to offer the release control. Unclaimed and not already
   * `Available` — releasing a tool that is already free is a no-op worth not
   * rendering a switch for.
   *
   * A release also clears `currentUser`: it holds a driver's display name put
   * there by dispatch, and "nobody has it" is exactly what `Available` means.
   * Applied in `updateToolAction`.
   */
  canRelease: boolean
  /**
   * Unclaimed, but `statusNew` still reads as claimed. The tool is invisible to
   * every picker for no reason, and the page says so rather than silently
   * offering the fix.
   */
  orphaned: boolean
}

export function editabilityOf(tool: ToolDetail, hold: ToolHold | null): ToolEditability {
  const unclaimed = hold === null
  const statusLocked = unclaimed && isStatusLocked(tool.status)
  return {
    movable: unclaimed && !statusLocked,
    hold,
    statusLocked,
    canRelease: unclaimed && tool.status !== TOOL_STATUS_AVAILABLE,
    orphaned: unclaimed && !isFreeToAssign(tool.status),
  }
}
