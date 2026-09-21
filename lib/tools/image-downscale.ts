/**
 * Shrinks a photo in the browser, before it is ever uploaded.
 *
 * A phone camera file is 3–4MB — every image already in this app's Bubble file
 * manager is. At that size a handful of photos blows past a server action's
 * body limit, costs a slow upload from a job site on cellular, and fills the
 * file manager with pixels nobody will look at. These images exist so somebody
 * can recognise a tool, and 1600px does that.
 *
 * `imageOrientation: "from-image"` is passed explicitly rather than left to the
 * browser default: the rotation an iPhone records lives in EXIF, and drawing a
 * bitmap onto a canvas is exactly where it would otherwise be dropped, landing
 * the photo sideways.
 *
 * **Browser-only** — `createImageBitmap` and `<canvas>`. Called from the client
 * island, never on the server. A format the browser can't decode (a stray HEIC)
 * throws, and the caller turns that into a message rather than a broken upload.
 */

const MAX_EDGE = 1600
const QUALITY = 0.8
const OUTPUT_TYPE = "image/jpeg"

export async function downscalePhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))

    const context = canvas.getContext("2d")
    if (!context) throw new Error("This browser can't resize images.")
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, OUTPUT_TYPE, QUALITY))
    if (!blob) throw new Error("This browser couldn't encode the photo.")

    return new File([blob], jpegName(file.name), { type: OUTPUT_TYPE })
  } finally {
    bitmap.close()
  }
}

/**
 * Everything is re-encoded to JPEG, so the extension has to follow it — a
 * `.png` holding JPEG bytes reads as a mistake in Bubble's File manager. The
 * stem is sanitised because it ends up in a URL path, and truncated because a
 * phone can hand over a very long one.
 */
function jpegName(original: string): string {
  const stem = original
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${stem || "tool-photo"}.jpg`
}
