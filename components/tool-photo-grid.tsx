"use client"

import { Trash2Icon } from "lucide-react"
import Image from "next/image"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { photoSrc } from "@/lib/tools/tool-photos"

/**
 * A tool's photos, and the full-size view behind them.
 *
 * `next/image` over a plain `<img>`: the grid renders squares far smaller than
 * the 1600px `downscalePhoto` uploads, and the optimiser is what keeps a
 * warehouse phone from pulling twelve full-size files to draw thumbnails.
 * `next.config.ts` allows the Bubble CDN by wildcard rather than by this app's
 * own subdomain hash.
 *
 * Remove is always visible rather than revealed on hover — these screens are
 * used on phones, where there is no hover to reveal it with.
 */
export function ToolPhotoGrid({
  photos,
  onRemove,
  disabled,
}: {
  photos: string[]
  onRemove: (url: string) => void
  disabled: boolean
}) {
  const [viewing, setViewing] = React.useState<string | null>(null)

  if (photos.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No photos yet</EmptyTitle>
          <EmptyDescription>Add a photo or two so this tool is easy to recognise.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((url, index) => (
          <li key={url} className="relative">
            <button
              type="button"
              onClick={() => setViewing(url)}
              className="relative block aspect-square w-full overflow-hidden rounded-lg border bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Image
                src={photoSrc(url)}
                alt={`Tool photo ${index + 1}`}
                fill
                sizes="(min-width: 1024px) 20vw, (min-width: 640px) 30vw, 45vw"
                className="object-cover"
              />
            </button>

            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              disabled={disabled}
              onClick={() => onRemove(url)}
              className="absolute top-1.5 right-1.5 shadow-xs"
            >
              <Trash2Icon />
              <span className="sr-only">Remove photo {index + 1}</span>
            </Button>
          </li>
        ))}
      </ul>

      <ToolPhotoLightbox url={viewing} onClose={() => setViewing(null)} />
    </>
  )
}

function ToolPhotoLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <Dialog open={url !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogTitle className="sr-only">Tool photo</DialogTitle>
        {url && (
          <div className="relative h-[70vh] w-full">
            <Image
              src={photoSrc(url)}
              alt="Tool photo"
              fill
              sizes="(min-width: 640px) 48rem, 100vw"
              className="rounded-lg object-contain"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
