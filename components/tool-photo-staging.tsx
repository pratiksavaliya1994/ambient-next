"use client"

import { ImagePlusIcon, Trash2Icon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { FieldDescription, FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { downscalePhoto } from "@/lib/tools/image-downscale"
import { MAX_PHOTOS_PER_UPLOAD, PHOTO_MIME_TYPES } from "@/lib/tools/tool-photos"

/**
 * A photo picked for a tool that doesn't exist yet.
 *
 * `url` is an object URL for the preview and is revoked when the photo is
 * removed. `id` exists because two identical picks would otherwise share a
 * React key.
 */
export type StagedPhoto = { id: string; file: File; url: string }

/**
 * Photos on the Add tool form, held locally until there is a row to attach
 * them to.
 *
 * The detail page's `ToolPhotos` uploads against an existing `toolId` on its
 * own round trip; a tool being created has no id yet, so these are staged —
 * downscaled at pick time, exactly as the detail page does it, and handed to
 * `createToolAction` with the rest of the form. `attachPhotos` uploads them
 * after the row exists, so a failed upload costs a photo rather than the tool.
 *
 * Capped at `MAX_PHOTOS_PER_UPLOAD` rather than `MAX_TOOL_PHOTOS`: these all
 * go up in one action, which is one body against `serverActions.bodySizeLimit`
 * and one sequential run against Bubble's rate limit. More can be added from
 * the tool's own page the moment it exists.
 *
 * A plain `<img>` rather than `next/image`, unlike `ToolPhotoGrid` — there is
 * nothing for the optimiser to fetch or cache behind a `blob:` URL that only
 * this tab can resolve.
 */
export function ToolPhotoStaging({
  photos,
  onChange,
  disabled,
}: {
  photos: StagedPhoto[]
  onChange: (next: StagedPhoto[]) => void
  disabled: boolean
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [resizing, startResize] = React.useTransition()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const full = photos.length >= MAX_PHOTOS_PER_UPLOAD
  const busy = disabled || resizing

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    // Cleared so picking the same file twice in a row still fires a change.
    event.target.value = ""
    if (picked.length === 0) return

    setError(null)

    if (photos.length + picked.length > MAX_PHOTOS_PER_UPLOAD) {
      setError(`Add up to ${MAX_PHOTOS_PER_UPLOAD} photos here — the rest from the tool's page once it exists.`)
      return
    }

    // Inside the transition for the same reason `ToolPhotos` does it: on a
    // phone, resizing a handful of 4MB camera files is the slower half.
    startResize(async () => {
      try {
        const resized = await Promise.all(picked.map(downscalePhoto))
        onChange([
          ...photos,
          ...resized.map((file) => ({
            id: crypto.randomUUID(),
            file,
            url: URL.createObjectURL(file),
          })),
        ])
      } catch {
        setError("Couldn't read one of those photos — try a JPEG or PNG.")
      }
    })
  }

  function onRemove(photo: StagedPhoto) {
    URL.revokeObjectURL(photo.url)
    onChange(photos.filter((staged) => staged.id !== photo.id))
  }

  return (
    <div className="flex flex-col gap-3">
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative">
              <div className="aspect-square w-full overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL the optimiser can't fetch */}
                <img src={photo.url} alt={`Photo ${index + 1}`} className="size-full object-cover" />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                disabled={busy}
                onClick={() => onRemove(photo)}
                className="absolute top-1.5 right-1.5 shadow-xs"
              >
                <Trash2Icon />
                <span className="sr-only">Remove photo {index + 1}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <FieldError>{error}</FieldError>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input ref={inputRef} type="file" accept={PHOTO_MIME_TYPES.join(",")} multiple hidden onChange={onPick} />
        <Button type="button" variant="outline" disabled={busy || full} onClick={() => inputRef.current?.click()}>
          {resizing ? <Spinner /> : <ImagePlusIcon />}
          Add photos
        </Button>
        <FieldDescription>
          {full
            ? `${MAX_PHOTOS_PER_UPLOAD} is the limit here — add more once the tool exists.`
            : `${photos.length} of ${MAX_PHOTOS_PER_UPLOAD} · uploaded when you save.`}
        </FieldDescription>
      </div>
    </div>
  )
}
