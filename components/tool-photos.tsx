"use client"

import { ImagePlusIcon } from "lucide-react"
import * as React from "react"

import { ToolPhotoGrid } from "@/components/tool-photo-grid"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { downscalePhoto } from "@/lib/tools/image-downscale"
import { MAX_PHOTOS_PER_UPLOAD, MAX_TOOL_PHOTOS, PHOTO_MIME_TYPES } from "@/lib/tools/tool-photos"
import { addToolPhotosAction, removeToolPhotoAction } from "@/app/(app)/tools/[toolId]/photo-actions"
import { INITIAL_TOOL_PHOTO_STATE, type ToolPhotoState } from "@/app/(app)/tools/action-state"

/**
 * The photo card's client island. Saves on its own — see `ToolPhotoState` for
 * why photos are not part of the edit form's Save changes.
 *
 * The downscale runs *inside* the transition, not before it, so the spinner
 * covers resizing a handful of 4MB camera files as well as the upload itself;
 * on a phone the resize is the slower half.
 */
export function ToolPhotos({ toolId, photos }: { toolId: string; photos: string[] }) {
  const [state, setState] = React.useState<ToolPhotoState>(INITIAL_TOOL_PHOTO_STATE)
  const [pending, startTransition] = React.useTransition()
  const inputRef = React.useRef<HTMLInputElement>(null)

  // The action returns the list Bubble now holds, so the grid follows the
  // write rather than the revalidated page — which lands a moment later and
  // agrees with it.
  const current = state.status === "saved" ? state.photos : photos
  const full = current.length >= MAX_TOOL_PHOTOS

  function settle(result: ToolPhotoState, title: string) {
    setState(result)
    if (result.status === "saved") toast.add({ title, description: result.warning })
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    // Cleared so picking the same file twice in a row still fires a change.
    event.target.value = ""
    if (picked.length === 0) return

    startTransition(async () => {
      if (picked.length > MAX_PHOTOS_PER_UPLOAD) {
        setState({ status: "error", message: `Add up to ${MAX_PHOTOS_PER_UPLOAD} photos at a time.` })
        return
      }

      let files: File[]
      try {
        files = await Promise.all(picked.map(downscalePhoto))
      } catch {
        setState({ status: "error", message: "Couldn't read one of those photos — try a JPEG or PNG." })
        return
      }

      settle(await addToolPhotosAction({ toolId, files }), picked.length === 1 ? "Photo added" : "Photos added")
    })
  }

  function onRemove(url: string) {
    startTransition(async () => settle(await removeToolPhotoAction({ toolId, url }), "Photo removed"))
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolPhotoGrid photos={current} onRemove={onRemove} disabled={pending} />

      {state.status === "error" && <FieldError>{state.message}</FieldError>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input ref={inputRef} type="file" accept={PHOTO_MIME_TYPES.join(",")} multiple hidden onChange={onPick} />
        <Button type="button" variant="outline" disabled={pending || full} onClick={() => inputRef.current?.click()}>
          {pending ? <Spinner /> : <ImagePlusIcon />}
          Add photos
        </Button>
        <span className="text-sm text-muted-foreground">
          {full
            ? `${MAX_TOOL_PHOTOS} is the limit — remove one to add another.`
            : `${current.length} of ${MAX_TOOL_PHOTOS}`}
        </span>
      </div>
    </div>
  )
}
