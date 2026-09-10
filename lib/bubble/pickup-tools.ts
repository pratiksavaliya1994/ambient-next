import "server-only"

import { z } from "zod"

import { bubbleListAll } from "@/lib/bubble/client"
import { NO_LOCATION, type DashboardTool, type PickupTool } from "@/lib/bubble/pickup-tools-types"
import { listToolTypes } from "@/lib/bubble/reference"

export { NO_LOCATION, type DashboardTool, type PickupTool }

/**
 * Individual physical tool instances (Bubble's `tools` type) — distinct from
 * `toolstype`, the catalogue Delivery picks from. Previously untouched by
 * this app; confirmed live against Bubble rather than guessed (`CLAUDE.md`
 * lists `tools` under "Types this app does not touch" with no field list).
 * Backs both the Pickup flow's tool selection (`listToolsForJob`) and the
 * Tools dashboard (`listAllTools`).
 *
 * `location` is free text that matches a `jobs.name` string exactly (or
 * `"Warehouse"` when not assigned to a job site) — not a link, same
 * non-referential pattern as `request.job`. Some live rows have it outright
 * blank rather than either of those; `listAllTools` buckets those under
 * `NO_LOCATION` instead of conflating them with `"Warehouse"`. `type` is a
 * real link to `toolstype._id`, resolved here to a name via the
 * already-cached `listToolTypes()` rather than a second Bubble round trip.
 * `currentUser` is free text (a display name, e.g. `"Carlos Faner"`) — not a
 * link to `user` — and empty on most rows.
 *
 * Deliberately not memoised like the other reference lists: a tool's status
 * and location are exactly the kind of thing that changes between visits, so
 * this is fetched fresh every time rather than cached for five minutes.
 */

const TOOLS = "tools"

const toolRow = z.looseObject({
  _id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  /** `ToolStatusNew` — the phase 2 lifecycle field, backfilled from the old
   *  `status` field on every live row. Both readers of this table
   *  (`listToolsForJob` and `listAllTools`) use this field now; the Pickup
   *  picker also writes it back through `update-tool-status`. */
  statusNew: z.string().optional(),
  floor: z.string().optional(),
  currentUser: z.string().optional(),
})

export async function listToolsForJob(jobName: string): Promise<PickupTool[]> {
  const [rows, toolTypes] = await Promise.all([
    bubbleListAll(TOOLS, {
      constraints: [{ key: "location", constraint_type: "equals", value: jobName }],
    }),
    listToolTypes(),
  ])

  const typeNameById = new Map(toolTypes.map((type) => [type.id, type.name]))

  return rows
    .map((row) => toolRow.parse(row))
    .filter((row) => row.name)
    .map((row) => ({
      id: row._id,
      name: row.name!,
      typeName: row.type ? typeNameById.get(row.type) ?? null : null,
      floor: row.floor ?? null,
      status: row.statusNew ?? "",
    }))
    .sort((a, b) => (a.typeName ?? "").localeCompare(b.typeName ?? "") || a.name.localeCompare(b.name))
}

/** Every tool, for the Tools dashboard — grouped and filtered by location there. */
export async function listAllTools(): Promise<DashboardTool[]> {
  const [rows, toolTypes] = await Promise.all([bubbleListAll(TOOLS, {}), listToolTypes()])

  const typeNameById = new Map(toolTypes.map((type) => [type.id, type.name]))

  return rows
    .map((row) => toolRow.parse(row))
    .filter((row) => row.name)
    .map((row) => ({
      id: row._id,
      name: row.name!,
      typeName: row.type ? (typeNameById.get(row.type) ?? null) : null,
      location: row.location?.trim() ? row.location.trim() : NO_LOCATION,
      floor: row.floor ?? null,
      // `statusNew`, not `status` — see the comment on `toolRow` above.
      status: row.statusNew ?? "",
      currentUser: row.currentUser?.trim() || null,
    }))
    .sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name))
}
