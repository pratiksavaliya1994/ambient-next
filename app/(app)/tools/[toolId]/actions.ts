"use server"

import { revalidatePath } from "next/cache"

import { requireSession } from "@/lib/auth/session"
import { WAREHOUSE_JOB_NAMES } from "@/lib/bubble/enums"
import { listJobs } from "@/lib/bubble/reference"
import { getTool, readToolHold, updateTool, type ToolPatch } from "@/lib/bubble/tool-detail"
import { TOOL_STATUS_AVAILABLE } from "@/lib/bubble/tool-enums"
import { toolEditSchema } from "@/lib/schemas/tool"
import { editabilityOf, type ToolDetail, type ToolHold } from "@/lib/tools/tool-edit"
import type { ToolEditState } from "@/app/(app)/tools/action-state"

/** Which `ToolDetail` field each patch key is supposed to land in — the
 *  post-write check reads the row back through this map. */
const LANDS_IN: Record<keyof ToolPatch, (tool: ToolDetail) => string> = {
  type: (tool) => tool.typeId ?? "",
  condition: (tool) => tool.condition,
  location: (tool) => tool.location,
  floor: (tool) => tool.floor,
  currentUser: (tool) => tool.currentUser,
  statusNew: (tool) => tool.status,
}

/**
 * Whether a location string names somewhere that exists. Byte-for-byte against
 * `jobs.name`, because that is how `tools.location` is queried — a trimmed or
 * case-folded match here would wave through exactly the near-misses this is
 * for. `listJobs` is the same five-minute-memoised read the request form uses.
 */
async function isKnownLocation(location: string): Promise<boolean> {
  if (location === "") return true
  if ((WAREHOUSE_JOB_NAMES as readonly string[]).includes(location)) return true
  return (await listJobs()).some((job) => job.name === location)
}

function holdRefusal(hold: ToolHold): string {
  if (hold.kind === "trip") {
    const driver = hold.driver ?? "another driver"
    return hold.started
      ? `This tool is out on ${driver}'s trip right now. Its location updates from the trip, not from here.`
      : `This tool is already planned onto ${driver}'s trip. Remove it from that trip first, then make changes here.`
  }
  return `This tool is reserved for ${hold.job}. Remove it from that request first, then make changes here.`
}

/**
 * Saves one tool's editable fields.
 *
 * Three things make this more than a PATCH:
 *
 * **It re-reads and re-guards immediately before writing.** The page's view of
 * who holds the tool is however old the render is, and a tool can be assigned
 * or planned onto a trip in the meantime. Same posture as `assignToolsAction`:
 * this narrows the window to about a second, it does not close it, because
 * Bubble has no transactions.
 *
 * **It patches only what changed.** Every `tools` save fires
 * `DB - Tools Change Log`, so rewriting a field with its own value spends a
 * `toolshistory` row saying nothing happened.
 *
 * **It reads the row back.** A Bubble option-set write with an unrecognised
 * display text fails *silently* — 200, no change — which would otherwise show
 * the user a success toast over a field that never moved. `condition` and
 * `statusNew` are both option sets.
 */
export async function updateToolAction(input: unknown): Promise<ToolEditState> {
  await requireSession()

  const parsed = toolEditSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form")
      fieldErrors[key] ??= issue.message
    }
    return { status: "invalid", message: "Those tool details aren't valid.", fieldErrors }
  }

  const values = parsed.data

  const tool = await getTool(values.toolId)
  if (!tool) {
    return { status: "error", message: "That tool no longer exists." }
  }

  const hold = await readToolHold(tool.id)
  const editability = editabilityOf(tool, hold)

  // Refuse the whole save rather than quietly dropping the locked half of it:
  // a PM who moved the location field and got a success toast would have no
  // reason to look again.
  const movesTool =
    values.location !== tool.location ||
    values.floor !== tool.floor ||
    values.currentUser !== tool.currentUser ||
    values.markAvailable
  if (movesTool && hold) {
    return { status: "error", message: holdRefusal(hold) }
  }

  // The referential check `tools.location` never got in Bubble. A value that
  // matches no `jobs.name` and no warehouse doesn't error — it forks the Tools
  // dashboard into two cards that can't find each other. Only a *changed*
  // location is checked, so the rows already holding an unknown string stay
  // saveable for their other fields.
  if (values.location !== tool.location && !(await isKnownLocation(values.location))) {
    return {
      status: "invalid",
      message: "That location isn't a job or a warehouse.",
      fieldErrors: { location: "Pick a job or warehouse from the list." },
    }
  }

  const patch: ToolPatch = {}
  if (values.typeId !== (tool.typeId ?? "")) patch.type = values.typeId
  // `""` is "leave it alone" — a blank or legacy condition the select can't
  // represent must not be overwritten just by opening the page. See the schema.
  if (values.condition !== "" && values.condition !== tool.condition) patch.condition = values.condition

  if (editability.movable) {
    if (values.location !== tool.location) patch.location = values.location
    if (values.floor !== tool.floor) patch.floor = values.floor

    if (values.markAvailable && editability.canRelease) {
      patch.statusNew = TOOL_STATUS_AVAILABLE
      // `Available` means nobody has it, so the last driver's name goes with
      // it — overriding whatever the input held, which the form has already
      // blanked to match. Skipped when it was empty anyway, so a release from
      // an unheld tool doesn't log a no-op change.
      if (tool.currentUser !== "") patch.currentUser = ""
    } else if (values.currentUser !== tool.currentUser) {
      patch.currentUser = values.currentUser
    }
  }

  // Reachable when the form is dirty but every change cancels out, or when the
  // only dirty fields were the locked ones on a held tool. Nothing to write, so
  // nothing to revalidate — but say so rather than claiming a save.
  if (Object.keys(patch).length === 0) {
    return { status: "saved", toolId: tool.id, name: tool.name, warning: "Nothing had changed." }
  }

  try {
    await updateTool(tool.id, patch)
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? `Couldn't save the change: ${error.message}` : "Couldn't save the change. Try again.",
    }
  }

  revalidatePath("/tools")
  revalidatePath("/tools/all")
  revalidatePath(`/tools/${tool.id}`)

  return {
    status: "saved",
    toolId: tool.id,
    name: tool.name,
    warning: await unappliedWarning(tool.id, patch),
  }
}

/** Friendly names for the fields named in `unappliedWarning`'s message. */
const FIELD_LABEL: Record<keyof ToolPatch, string> = {
  type: "Type",
  condition: "Condition",
  location: "Location",
  floor: "Floor",
  currentUser: "Current holder",
  statusNew: "Release status",
}

/**
 * Reads the row back and names any field that didn't take.
 *
 * The row is committed by the time this runs, so a mismatch is a warning on a
 * successful save, never an error — the same distinction `assignToolsAction`
 * draws when its follow-up status write fails.
 */
async function unappliedWarning(toolId: string, patch: ToolPatch): Promise<string | undefined> {
  const after = await getTool(toolId).catch(() => null)
  if (!after) return undefined

  const unapplied = (Object.keys(patch) as (keyof ToolPatch)[]).filter((key) => LANDS_IN[key](after) !== patch[key])
  if (unapplied.length === 0) return undefined

  const fields = unapplied.map((key) => FIELD_LABEL[key]).join(", ")
  return `${fields} didn't save. Try picking a different value and saving again.`
}
