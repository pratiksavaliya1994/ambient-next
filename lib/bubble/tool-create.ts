import "server-only"

import { z } from "zod"

import { bubbleCreate, bubbleListAll } from "@/lib/bubble/client"
import { LEGACY_STATUS_OK, TOOL_STATUS_AVAILABLE, type ToolCondition } from "@/lib/bubble/tool-enums"

/**
 * Bringing a new physical tool into existence — the second `tools` writer in
 * this app that isn't a Bubble workflow, and its only `POST /obj/tools`.
 *
 * Its own module rather than more of `tool-detail.ts` for the same reason that
 * file exists: that one is the detail page's read-whole-and-patch half, and a
 * create has different fields, a different guard (the name probe below) and no
 * hold gate at all — nothing can be holding a tool that doesn't exist yet.
 *
 * A plain Data API create, not a `/wf/` workflow, by the same rule the rest of
 * the tool screens follow: every workflow in this app exists because it does
 * more than one thing — fans out over a list, creates child rows, sets
 * `request.status` in the same breath. Writing one row does none of that.
 * `DB - Tools Change Log` still fires, so the tool gets its opening
 * `toolshistory` entry without this module logging one.
 */

const TOOLS = "tools"

/**
 * Trimmed and case-folded — the form of a name two rows are considered to
 * share. `tools.name` is free text with nothing enforcing uniqueness, and the
 * live table already proves both halves of this matter: two names carry
 * trailing spaces (`"Pumpjack #3 Red LW "`), and two pairs already collide
 * case-insensitively (`electric pumpjack #16`, `small 880 grinder #1`).
 *
 * Those existing collisions are left alone — this guards new rows; it is not a
 * migration.
 */
export function normaliseToolName(name: string): string {
  return name.trim().toLowerCase()
}

const nameRow = z.looseObject({ _id: z.string(), name: z.string().optional() })

/** The tool already wearing a name, so the form can link to it rather than just refuse. */
export type ToolNameClash = { id: string; name: string }

/**
 * The row whose name collides with `name`, or `null`.
 *
 * **`text contains`, not `equals`** — and the difference is the whole point.
 * Probed live 2026-09-22: `equals` on `tools.name` is both case- and
 * whitespace-sensitive (`"s26 #7"` and `"S26 #7 "` each return nothing against
 * a live `"S26 #7"`), so it would miss precisely the duplicates this is meant
 * to catch. `text contains` is case-insensitive and matched every full name
 * tried, including ones carrying `#`.
 *
 * It is a **prefilter, not the answer**: `text contains` is a substring/word
 * search, so it also returns `"Grinder 12"` for `"Grinder 1"`. The exact
 * comparison is `normaliseToolName` on the rows it hands back. That direction
 * is the safe one — a superset costs a comparison, a subset would let a
 * duplicate through.
 *
 * One round trip, which is what makes it cheap enough to run on a debounce.
 */
export async function findToolNameClash(name: string): Promise<ToolNameClash | null> {
  const wanted = normaliseToolName(name)
  if (wanted === "") return null

  const rows = await bubbleListAll(TOOLS, {
    constraints: [{ key: "name", constraint_type: "text contains", value: name.trim() }],
  })

  const clash = rows.map((row) => nameRow.parse(row)).find((row) => normaliseToolName(row.name ?? "") === wanted)

  return clash ? { id: clash._id, name: clash.name ?? "" } : null
}

/** What the create form decides. Everything else about a new tool is fixed below. */
export type NewTool = {
  name: string
  /** `toolstype._id` — required here, unlike the edit form, which tolerates the legacy typeless rows. */
  typeId: string
  location: string
  floor: string
  warehouseLocation: string
  condition: ToolCondition
}

/**
 * Writes the row and returns its `_id`.
 *
 * Three fields are the caller's and three are not:
 *
 * - **`statusNew` is always `Available`.** Every other value in
 *   `TOOL_STATUS_NEW` asserts a claim backed by an `assignedtools` or
 *   `triptool` row, and a tool being born has neither — the same reasoning
 *   that types `ToolPatch["statusNew"]` to the one literal.
 * - **`status` (the legacy field) is stamped once, here only.** See
 *   `LEGACY_STATUS_OK`: Bubble has no default, so a new row would read blank
 *   in the old Bubble UI forever and nothing in this app would ever write it.
 * - **`currentUser` is left unset**, not written empty. `Available` means
 *   nobody has it, and an absent field says that more honestly than `""`.
 *
 * Empty `location`/`floor` are omitted rather than sent as `""`, so a new row
 * looks like an untouched one instead of one someone cleared.
 */
export async function createTool(tool: NewTool): Promise<string> {
  const data: Record<string, unknown> = {
    name: tool.name,
    type: tool.typeId,
    condition: tool.condition,
    statusNew: TOOL_STATUS_AVAILABLE,
    status: LEGACY_STATUS_OK,
  }
  if (tool.location !== "") data.location = tool.location
  if (tool.floor !== "") data.floor = tool.floor
  if (tool.warehouseLocation !== "") data.warehouseLocation = tool.warehouseLocation

  return bubbleCreate(TOOLS, data)
}
