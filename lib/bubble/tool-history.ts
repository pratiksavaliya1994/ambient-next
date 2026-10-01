import "server-only"

import { z } from "zod"

import { bubbleListAll } from "@/lib/bubble/client"
import { listUsers } from "@/lib/bubble/reference"
import { photoSrc } from "@/lib/tools/tool-photos"

/**
 * `toolshistory` — the audit trail `DB - Tools Change Log` writes automatically
 * on every `tools` save, from any writer (this app's own `PATCH`, its
 * `/wf/` workflows, or the old Bubble UI's `/wf/Set Status` / `/wf/Set
 * Location`). See the `### tools` section of `CLAUDE.md` for the full writer
 * history; this module only reads the result.
 *
 * Two status pairs exist on the row: `prevStatus`/`newStatus` are the legacy
 * `Tool Status` option set, always populated (even with an unchanged value)
 * because the change-log workflow stamps them on every save regardless of
 * what actually changed; `prevStatusNew`/`newStatusNew` are the current
 * `ToolStatusNew` lifecycle pair, added later and only present on rows logged
 * since. A row can carry either pair, both, or neither (a picture-only or
 * notes-only edit) — `statusOf` below prefers the lifecycle pair and falls
 * back to the legacy one only when it's missing.
 */

const TOOLS_HISTORY = "toolshistory"

const historyRow = z.looseObject({
  _id: z.string(),
  tool: z.string().optional(),
  "Created Date": z.string().optional(),
  "Created By": z.string().optional(),
  doneBy: z.string().optional(),
  prevLocation: z.string().optional(),
  newLocation: z.string().optional(),
  prevLocationFloor: z.string().optional(),
  newLocationFloor: z.string().optional(),
  prevStatus: z.string().optional(),
  newStatus: z.string().optional(),
  prevStatusNew: z.string().optional(),
  newStatusNew: z.string().optional(),
  notes: z.string().optional(),
  picture: z.string().optional(),
})

export type ToolHistoryEntry = {
  id: string
  /** ISO timestamp, or `null` if Bubble somehow omitted `Created Date`. */
  at: string | null
  /** `doneBy` if stamped, else the resolved `Created By` user, else `"System"`. */
  by: string
  prevLocation: string | null
  newLocation: string | null
  prevFloor: string | null
  newFloor: string | null
  prevStatus: string | null
  newStatus: string | null
  notes: string | null
  /** `https:` given Bubble's stored `//cdn...` protocol-relative URLs. */
  pictureUrl: string | null
}

/** Bubble stores an empty text field as `""`, which is not "no value" here. */
function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Every `toolshistory` row for one tool, newest first.
 *
 * **Who made the change comes from `doneBy` first.** Every write reaches Bubble
 * under the API token, so `Created By` is the token's own user on anything
 * this app produced. Instead, each writer stamps the person's name on
 * `tools.lastEditedBy`, and `DB - Tools Change Log` copies it into `doneBy`
 * (see `currentActor`). Rows logged before that, or by a writer that clears
 * the field, fall back to `Created By`, resolved against `listUsers()` (the
 * same cached list the Dispatch board uses). That still names a real person
 * on old-Bubble-UI rows. The API token's user has no `displayName`, so it is
 * filtered out of that list and reads as `"System"` rather than a raw id.
 */
export async function listToolHistory(toolId: string): Promise<ToolHistoryEntry[]> {
  const [rows, users] = await Promise.all([
    bubbleListAll(TOOLS_HISTORY, {
      constraints: [{ key: "tool", constraint_type: "equals", value: toolId }],
      sortField: "Created Date",
      descending: true,
    }),
    listUsers(),
  ])

  const nameById = new Map(users.map((user) => [user.id, user.name]))

  return rows
    .map((row) => historyRow.parse(row))
    .map((row) => ({
      id: row._id,
      at: row["Created Date"] ?? null,
      by: orNull(row.doneBy) ?? ((row["Created By"] && nameById.get(row["Created By"])) || "System"),
      prevLocation: orNull(row.prevLocation),
      newLocation: orNull(row.newLocation),
      prevFloor: orNull(row.prevLocationFloor),
      newFloor: orNull(row.newLocationFloor),
      prevStatus: orNull(row.prevStatusNew) ?? orNull(row.prevStatus),
      newStatus: orNull(row.newStatusNew) ?? orNull(row.newStatus),
      notes: orNull(row.notes),
      pictureUrl: row.picture ? photoSrc(row.picture) : null,
    }))
}
