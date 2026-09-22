import { z } from "zod"

import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_UPLOAD,
  MAX_UPLOAD_BATCH_BYTES,
  PHOTO_MIME_TYPES,
} from "@/lib/tools/tool-photos"

/**
 * What the photo controls send. Server-side only, unlike `toolEditSchema`
 * which `react-hook-form` also resolves against — there is no form here, just
 * a file input, and the browser has already refused an oversized pick before
 * spending a downscale on it. This is the re-check, because a server action is
 * reachable by direct POST.
 *
 * `z.instanceof(Blob)` rather than `z.file()`: React encodes a server action's
 * `Blob` arguments as multipart parts and Node hands them back as `File`,
 * which is a `Blob` — but `Blob` is the guaranteed floor, and an upload that
 * worked failing validation on a runtime detail is a bad way to discover the
 * difference. The filename is recovered defensively in the action.
 */
const photoBlob = z
  .instanceof(Blob, { message: "That isn't a file." })
  .refine((blob) => blob.size > 0, "That file is empty.")
  .refine((blob) => blob.size <= MAX_PHOTO_BYTES, "That photo is too large.")
  .refine((blob) => (PHOTO_MIME_TYPES as readonly string[]).includes(blob.type), "Only JPEG, PNG or WebP photos.")

/**
 * One save's worth of photos, **without** a minimum — the Add tool form stages
 * photos alongside the rest of the row and submitting none is the ordinary
 * case, while the detail page's Add photos button has nothing to do unless at
 * least one was picked. `toolPhotoUploadSchema` adds that `min(1)`; the create
 * action uses this as-is.
 */
export const toolPhotoFilesSchema = z
  .array(photoBlob)
  .max(MAX_PHOTOS_PER_UPLOAD, `Add up to ${MAX_PHOTOS_PER_UPLOAD} photos at a time.`)
  .refine(
    (files) => files.reduce((total, file) => total + file.size, 0) <= MAX_UPLOAD_BATCH_BYTES,
    "That's too much at once — add a few photos at a time."
  )

export const toolPhotoUploadSchema = z.object({
  toolId: z.string().min(1),
  files: toolPhotoFilesSchema.refine((files) => files.length > 0, "Pick at least one photo."),
})

/**
 * Removal is by URL, not by index. The list can have moved under an open page
 * — another tab, the old Bubble UI — and an index would then delete a
 * different photo than the one clicked, silently. A URL that is no longer
 * there is simply a no-op the action reports.
 */
export const toolPhotoRemoveSchema = z.object({
  toolId: z.string().min(1),
  url: z.string().min(1),
})
