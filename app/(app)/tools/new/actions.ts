"use server"

import { revalidatePath } from "next/cache"

import { displayNameOf, requireSession } from "@/lib/auth/session"
import { bubbleUploadFile } from "@/lib/bubble/client"
import { isKnownToolLocation, listToolTypes } from "@/lib/bubble/reference"
import { createTool, findToolNameClash } from "@/lib/bubble/tool-create"
import { getTool, setToolPhotos } from "@/lib/bubble/tool-detail"
import { TOOL_STATUS_AVAILABLE } from "@/lib/bubble/tool-enums"
import { toolCreateSchema, toolNameCheckSchema } from "@/lib/schemas/tool"
import { toolPhotoFilesSchema } from "@/lib/schemas/tool-photos"
import type { ToolCreateState, ToolNameCheck } from "@/app/(app)/tools/action-state"

/**
 * Creating a tool, and the name probe the form runs while you type.
 *
 * The probe is a convenience and `createToolAction` is the guard — it re-runs
 * the same lookup immediately before writing, because the form's verdict is
 * however old the last keystroke is, a server action is reachable by direct
 * POST, and two people can be naming the same tool in different tabs. Same
 * posture `updateToolAction` takes toward its hold gate: this narrows the
 * window, it does not close it, because Bubble has no transactions and
 * `tools.name` has no uniqueness constraint behind it.
 */

/** The form's values plus the photos staged beside them. */
const createInputSchema = toolCreateSchema.extend({ photos: toolPhotoFilesSchema })

export async function checkToolNameAction(input: unknown): Promise<ToolNameCheck> {
  await requireSession()

  const parsed = toolNameCheckSchema.safeParse(input)
  if (!parsed.success) return { status: "idle" }

  const { name } = parsed.data

  try {
    const clash = await findToolNameClash(name)
    return clash
      ? { status: "taken", name, toolId: clash.id, existingName: clash.name }
      : { status: "available", name }
  } catch {
    // A failed probe must not read as "that name is free" *or* block the save.
    // `createToolAction` is the one that actually decides.
    return { status: "unknown", name }
  }
}

export async function createToolAction(input: unknown): Promise<ToolCreateState> {
  const session = await requireSession()
  const actor = displayNameOf(session)

  const parsed = createInputSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form")
      fieldErrors[key] ??= issue.message
    }
    return { status: "invalid", message: "Those tool details aren't valid.", fieldErrors }
  }

  const { photos, ...values } = parsed.data

  // `typeId` is a link, so a value that isn't a real `toolstype._id` doesn't
  // error — it writes a dangling reference that resolves to no name anywhere
  // the catalogue is read. `listToolTypes` is the same five-minute-memoised
  // read the form was populated from.
  const toolTypes = await listToolTypes()
  if (!toolTypes.some((type) => type.id === values.typeId)) {
    return {
      status: "invalid",
      message: "That tool type isn't in the catalogue.",
      fieldErrors: { typeId: "Pick a type from the list." },
    }
  }

  // Same referential check the edit form makes, and for the same reason: a
  // location matching no `jobs.name` forks the Tools dashboard into two cards
  // that can't find each other. See `isKnownToolLocation`.
  if (!(await isKnownToolLocation(values.location))) {
    return {
      status: "invalid",
      message: "That location isn't a job or a warehouse.",
      fieldErrors: { location: "Pick a job or warehouse from the list." },
    }
  }

  const clash = await findToolNameClash(values.name)
  if (clash) {
    return {
      status: "invalid",
      message: "A tool already has that name.",
      fieldErrors: { name: `"${clash.name}" already exists — pick a different name.` },
    }
  }

  let toolId: string
  try {
    toolId = await createTool(values, actor)
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? `Couldn't create the tool: ${error.message}` : "Couldn't create the tool. Try again.",
    }
  }

  const [unapplied, photoWarning] = await Promise.all([
    unappliedWarning(toolId, values.typeId, values.condition),
    attachPhotos(toolId, photos, actor),
  ])

  revalidatePath("/tools")
  revalidatePath("/tools/all")

  return { status: "created", toolId, name: values.name, warning: unapplied ?? photoWarning }
}

/**
 * Reads the new row back and names any field that didn't take.
 *
 * The same guard `updateToolAction` runs, and for the same reason: a Bubble
 * option-set write with an unrecognised display text **fails silently** — 200,
 * no change — and a create writes three of them (`condition`, `statusNew`, and
 * the legacy `status`). Without this, a value the option set had quietly been
 * renamed out from under would produce a success toast over a tool that is
 * blank where it matters.
 *
 * `status` isn't checked, only because `getTool` doesn't read the legacy field
 * and nothing else in this app does either. `statusNew` is the one the pickers
 * gate on, and a tool born without it drops out of all of them — which is
 * exactly the orphan state `/tools/[toolId]` exists to repair, so the warning
 * points there.
 *
 * A mismatch is a warning on a real row, never an error: the tool exists by
 * the time this runs.
 */
async function unappliedWarning(toolId: string, typeId: string, condition: string): Promise<string | undefined> {
  const after = await getTool(toolId).catch(() => null)
  if (!after) return undefined

  const unapplied = [
    after.typeId === typeId ? null : "Type",
    after.condition === condition ? null : "Condition",
    after.status === TOOL_STATUS_AVAILABLE ? null : "Status",
  ].filter((field) => field !== null)

  if (unapplied.length === 0) return undefined
  return `The tool was created, but ${unapplied.join(", ")} didn't save. Fix it on its own page.`
}

/**
 * Uploads the staged photos onto the row that now exists.
 *
 * **After the create, never part of it** — Bubble has no transaction and no
 * bulk endpoint, so a file upload folded into the create would mean a failed
 * photo could cost the tool. This way the worst case is a real tool with fewer
 * photos than were picked, which is a warning and a trip to its Photos card,
 * not lost work. Uploads are sequential for the same reason
 * `addToolPhotosAction` does it: Bubble rate-limits by plan and this app is on
 * a low tier.
 */
async function attachPhotos(toolId: string, photos: Blob[], actor: string): Promise<string | undefined> {
  if (photos.length === 0) return undefined

  const uploaded: string[] = []
  let failed = 0
  for (const [index, photo] of photos.entries()) {
    try {
      const contents = Buffer.from(await photo.arrayBuffer()).toString("base64")
      uploaded.push(await bubbleUploadFile(photoName(photo, index), contents))
    } catch {
      failed++
    }
  }

  if (uploaded.length === 0) {
    return "The tool was created, but its photos couldn't be uploaded. Add them from the tool's page."
  }

  try {
    await setToolPhotos(toolId, uploaded, actor)
  } catch {
    return "The tool was created, but its photos couldn't be attached. Add them from the tool's page."
  }

  return failed > 0 ? `${failed} ${failed === 1 ? "photo" : "photos"} couldn't be uploaded.` : undefined
}

/** Same defensive filename recovery as `photo-actions.ts` — see the note there. */
function photoName(photo: Blob, index: number): string {
  const name = (photo as File).name
  return typeof name === "string" && name.trim() !== "" ? name : `tool-photo-${index + 1}.jpg`
}
