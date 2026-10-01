"use server"

import { revalidatePath } from "next/cache"

import { displayNameOf, requireSession } from "@/lib/auth/session"
import { bubbleUploadFile } from "@/lib/bubble/client"
import { getTool, setToolPhotos } from "@/lib/bubble/tool-detail"
import { toolPhotoRemoveSchema, toolPhotoUploadSchema } from "@/lib/schemas/tool-photos"
import { MAX_TOOL_PHOTOS } from "@/lib/tools/tool-photos"
import type { ToolPhotoState } from "@/app/(app)/tools/action-state"

/**
 * Adding and removing a tool's photos.
 *
 * Its own file rather than more of `actions.ts`, which is already near the
 * 300-line cap and is about the edit *form* — these two are not part of that
 * save and are not gated the way it is.
 *
 * **No hold gate here, deliberately.** `updateToolAction` refuses a save while
 * a trip or an open request holds the tool, because location and holder are
 * then the trip's to say. A photo asserts nothing about where a tool is or who
 * has it; it is how somebody recognises it, and a tool out on a truck is
 * exactly when a driver would want to add one.
 *
 * Adding is two writes that cannot be one: the file goes to Bubble's file
 * manager (`bubbleUploadFile`), then its URL is appended to `tools.photos`
 * (`setToolPhotos`). A failure between them leaves an unreferenced file, which
 * costs storage and nothing else.
 */

export async function addToolPhotosAction(input: unknown): Promise<ToolPhotoState> {
  const session = await requireSession()

  const parsed = toolPhotoUploadSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Those photos aren't valid." }
  }

  const { toolId, files } = parsed.data

  const tool = await getTool(toolId)
  if (!tool) return { status: "error", message: "That tool no longer exists." }

  if (tool.photos.length + files.length > MAX_TOOL_PHOTOS) {
    return {
      status: "error",
      message: `A tool holds up to ${MAX_TOOL_PHOTOS} photos — remove some first.`,
    }
  }

  // Sequential, not `Promise.all`: Bubble rate-limits by plan and this app is
  // on a low tier, so eight parallel uploads would spend the retry budget in
  // `bubbleUploadFile` rather than finish sooner.
  const uploaded: string[] = []
  let failed = 0
  for (const [index, file] of files.entries()) {
    try {
      const contents = Buffer.from(await file.arrayBuffer()).toString("base64")
      uploaded.push(await bubbleUploadFile(photoName(file, index), contents))
    } catch {
      failed++
    }
  }

  if (uploaded.length === 0) {
    return { status: "error", message: "Couldn't upload those photos. Try again." }
  }

  // Re-read instead of appending to the list this action opened with. Bubble
  // sets a list rather than adding to one, so the append is read-modify-write
  // and the read wants to be as late as possible — it narrows the window, it
  // does not close it, same as `updateToolAction`'s re-read before writing.
  const fresh = (await getTool(toolId))?.photos ?? tool.photos
  const photos = [...fresh, ...uploaded].slice(0, MAX_TOOL_PHOTOS)

  try {
    await setToolPhotos(toolId, photos, displayNameOf(session))
  } catch (error) {
    return { status: "error", message: saveFailure(error) }
  }

  revalidatePath(`/tools/${toolId}`)

  return {
    status: "saved",
    photos,
    warning: failed > 0 ? `${failed} ${failed === 1 ? "photo" : "photos"} couldn't be uploaded.` : undefined,
  }
}

/**
 * Drops one URL from the list.
 *
 * **The file itself stays in Bubble's file manager.** The Data API has no
 * delete-file endpoint, so this unlinks rather than deletes, and clearing the
 * orphans out is a File manager job inside Bubble. Worth stating plainly: the
 * button says "remove", and a reader will want to know which of the two it
 * means.
 */
export async function removeToolPhotoAction(input: unknown): Promise<ToolPhotoState> {
  const session = await requireSession()

  const parsed = toolPhotoRemoveSchema.safeParse(input)
  if (!parsed.success) return { status: "error", message: "That photo reference isn't valid." }

  const { toolId, url } = parsed.data

  const tool = await getTool(toolId)
  if (!tool) return { status: "error", message: "That tool no longer exists." }

  const photos = tool.photos.filter((photo) => photo !== url)
  if (photos.length === tool.photos.length) {
    return { status: "saved", photos: tool.photos, warning: "That photo had already been removed." }
  }

  try {
    await setToolPhotos(toolId, photos, displayNameOf(session))
  } catch (error) {
    return { status: "error", message: saveFailure(error) }
  }

  revalidatePath(`/tools/${toolId}`)

  return { status: "saved", photos }
}

/**
 * React encodes a server action's `Blob` arguments as multipart parts, so a
 * `File`'s name usually survives the trip. `Blob` with no name is what the
 * schema validates down to, and Bubble's File manager still needs something to
 * list the upload under.
 */
function photoName(file: Blob, index: number): string {
  const name = (file as File).name
  return typeof name === "string" && name.trim() !== "" ? name : `tool-photo-${index + 1}.jpg`
}

function saveFailure(error: unknown): string {
  return error instanceof Error ? `Couldn't save the change: ${error.message}` : "Couldn't save the change. Try again."
}
