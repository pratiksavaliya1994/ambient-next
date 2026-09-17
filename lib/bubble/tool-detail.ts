import "server-only"

import { z } from "zod"

import { listRequestClaims } from "@/lib/bubble/assigned-tools"
import { bubbleGet, bubblePatch } from "@/lib/bubble/client"
import { listToolTypes } from "@/lib/bubble/reference"
import { TOOL_STATUS_AVAILABLE, type ToolCondition } from "@/lib/bubble/tool-enums"
import { listToolTripRows } from "@/lib/bubble/triptool-read"
import { listToolClaims } from "@/lib/bubble/trips-read"
import { tripFlagOf, type TripFlag } from "@/lib/trips/plan-types"
import type { ToolDetail, ToolHold } from "@/lib/tools/tool-edit"

/**
 * One tool, read whole and written back — the detail page's half of the `tools`
 * table, as opposed to `pickup-tools.ts`'s list reads.
 *
 * Separate module because this is the **only writer of `tools` in the repo that
 * isn't a Bubble workflow**. Every other write — `update-tool-status`,
 * `update-request-status`, the trip workflows — goes through `/wf/` because it
 * does more than one thing: fans out over a list, creates child rows, sets
 * `request.status` in the same breath. Editing one row's fields does none of
 * that, so it is a plain `PATCH /obj/tools/{id}` and `bubblePatch` finally has
 * a caller.
 *
 * **`toolshistory` still gets its row.** `DB - Tools Change Log` is a Bubble
 * data-event workflow on `A tools is modified`, not something any workflow
 * calls, so it fires for whoever saves the row — that is how the old Bubble
 * UI's `/wf/Set Status` edits are logged too. It has never been exercised from
 * a Data API write before, though, so it is worth confirming once against a
 * real edit — see the note under `### tools` in `CLAUDE.md`.
 */

const TOOLS = "tools"

const toolRow = z.looseObject({
  _id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  statusNew: z.string().optional(),
  condition: z.string().optional(),
  floor: z.string().optional(),
  currentUser: z.string().optional(),
})

/**
 * `null` when Bubble has no such row — `bubbleGet` already turns a 404 into
 * `null`, so the page can go straight to `notFound()`.
 *
 * `location` comes back **raw and trimmed**, not bucketed into `NO_LOCATION`
 * the way `listAllTools` does it: this value is about to be written back, and
 * a sentinel is not a location.
 */
export async function getTool(id: string): Promise<ToolDetail | null> {
  const [raw, toolTypes] = await Promise.all([bubbleGet(TOOLS, id), listToolTypes()])
  if (!raw) return null

  const row = toolRow.parse(raw)
  const typeId = row.type ?? null

  return {
    id: row._id,
    name: row.name ?? "",
    typeId,
    typeName: typeId ? (toolTypes.find((type) => type.id === typeId)?.name ?? null) : null,
    location: row.location?.trim() ?? "",
    floor: row.floor?.trim() ?? "",
    status: row.statusNew ?? "",
    condition: row.condition ?? "",
    currentUser: row.currentUser?.trim() ?? "",
  }
}

/**
 * Whatever holds this tool right now, or `null` if nothing does — the gate
 * behind every movement field on the detail page.
 *
 * Both halves are the guards `assignToolsAction` already runs, reused rather
 * than reimplemented: `listToolClaims` for an open trip's `triptool` row,
 * `listRequestClaims` for an open request's `assignedtools` row. Neither is
 * passed an exclusion — this page belongs to no request and no trip, so every
 * claim counts against it.
 *
 * A trip wins when both answer, for two reasons: a dispatched request's tools
 * are held by both by construction, and the trip is the one with a screen to go
 * and release it on.
 */
export async function readToolHold(id: string): Promise<ToolHold | null> {
  const [tripClaims, requestClaims] = await Promise.all([listToolClaims([id]), listRequestClaims([id])])

  const trip = tripClaims.get(id)
  if (trip) {
    return { kind: "trip", tripId: trip.id, driver: trip.driver, started: trip.status === "In Transit" }
  }

  const request = requestClaims.get(id)
  if (request) {
    return { kind: "request", requestId: request.requestId, job: request.job, pickup: request.pickup }
  }

  return null
}

/**
 * What the last trip to touch this tool decided about it, or `null`.
 *
 * `listTripFlags` answers the same question keyed by *request*, which is right
 * on a request screen and wrong here — this page belongs to no request, and a
 * tool that has been on several would produce several answers. Reading the
 * newest `triptool` row directly is the tool-shaped version of the same
 * newest-row-wins rule.
 *
 * Worth surfacing because a **refusal is invisible in `tools`**: the drop never
 * happened, so the row comes home reading `Available` at the warehouse, exactly
 * like a tool that never left.
 */
export async function readToolTripFlag(id: string): Promise<TripFlag | null> {
  const rows = await listToolTripRows([id])
  const newest = rows.at(-1)
  return newest ? tripFlagOf(newest.state) : null
}

/**
 * The fields the detail page may write. Everything is optional — an unchanged
 * field is left out of the PATCH rather than rewritten with its own value, so a
 * save that touches only `condition` produces a one-field `toolshistory` entry
 * instead of a wall of no-op changes.
 *
 * `statusNew` is typed to the `Available` literal on purpose. This page creates
 * no `assignedtools` row and no `triptool` row, so it has no claim to back any
 * other value, and making that a compile error is cheaper than trusting every
 * future call site to remember. Condition-flavoured states (`Missing`,
 * `Repair Required`, …) are reachable through `condition`, which is where
 * phase 3A put them.
 */
export type ToolPatch = {
  /** `toolstype._id`, or `""` to unlink. */
  type?: string
  condition?: ToolCondition
  location?: string
  floor?: string
  currentUser?: string
  statusNew?: typeof TOOL_STATUS_AVAILABLE
}

export async function updateTool(id: string, patch: ToolPatch): Promise<void> {
  await bubblePatch(TOOLS, id, patch)
}
