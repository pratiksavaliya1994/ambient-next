import "server-only"

import { z } from "zod"

import { bubbleListAll } from "@/lib/bubble/client"
import { listToolTypes } from "@/lib/bubble/reference"

/**
 * Individual physical tool instances (Bubble's `tools` type), for the Pickup
 * flow's tool selection — distinct from `toolstype`, the catalogue Delivery
 * picks from. Previously untouched by this app; confirmed live against
 * Bubble rather than guessed (`CLAUDE.md` lists `tools` under "Types this app
 * does not touch" with no field list).
 *
 * `location` is free text that matches a `jobs.name` string exactly (or
 * `"Warehouse"` when not assigned to a job site) — not a link, same
 * non-referential pattern as `request.job`. `type` is a real link to
 * `toolstype._id`, resolved here to a name via the already-cached
 * `listToolTypes()` rather than a second Bubble round trip.
 *
 * Deliberately not memoised like the other reference lists: a job's tool set
 * (which units are on site, their status) is exactly the kind of thing that
 * changes between visits, so this is fetched fresh every time the picker
 * dialog opens rather than cached for five minutes.
 */

const TOOLS = "tools"

const toolRow = z.looseObject({
  _id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
  floor: z.string().optional(),
})

export type PickupTool = {
  id: string
  name: string
  typeName: string | null
  floor: string | null
  status: string
}

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
      status: row.status ?? "Ok",
    }))
    .sort((a, b) => (a.typeName ?? "").localeCompare(b.typeName ?? "") || a.name.localeCompare(b.name))
}
