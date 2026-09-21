/**
 * `tools.photos` — a Bubble **list of images**, which over the Data API is an
 * array of file-manager URLs. Distinct from the older single `tools.photo`,
 * which this app reads nowhere and leaves to the old Bubble UI.
 *
 * Pure and client-safe, beside `tool-edit.ts`: the browser needs the limits to
 * refuse a file before spending a downscale and an upload on it, and the server
 * re-checks the same constants because a server action is reachable by direct
 * POST.
 */

/** Bubble stores `//host/path`; an `<img>` or `next/image` needs a scheme. */
export function photoSrc(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url
}

/**
 * Not a Bubble limit — a screenful. These photos exist so somebody can
 * recognise a tool, and a unit needing a thirteenth angle is a labelling
 * problem rather than a storage one.
 */
export const MAX_TOOL_PHOTOS = 12

/**
 * How many one save may add. Keeps a single server action's body bounded, and
 * keeps a mis-tap in a phone's photo library from uploading a whole roll.
 */
export const MAX_PHOTOS_PER_UPLOAD = 8

/**
 * Per photo, **after** `downscalePhoto` has capped the long edge at 1600px — a
 * phone photo lands around 200–400KB there, so this is the ceiling for the odd
 * dense one, not the expected size.
 */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024

/**
 * Per save, across every photo in it. Sits below
 * `serverActions.bodySizeLimit` (10mb in `next.config.ts`) on purpose: going
 * over this returns a typed error the form can show, while going over the
 * body limit fails the request before the action ever runs.
 */
export const MAX_UPLOAD_BATCH_BYTES = 8 * 1024 * 1024

/** What the file input accepts and the schema enforces. */
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
