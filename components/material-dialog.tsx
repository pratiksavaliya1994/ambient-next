"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

/**
 * The material line, as one free-text field — no catalogue, no per-item
 * selection, unlike `ToolPickerDialog`. Bubble's `materials` table only
 * offers a starting point, not a set of choices.
 *
 * Edits are buffered in a local draft and only committed to the form by
 * "Done". Dismissing the dialog any other way — the X, Escape, a click on the
 * backdrop — throws the draft away and leaves the form's `materials` exactly
 * as it was, including leaving it empty.
 *
 * Opening it while the field is still empty seeds the draft from the `toDo`'s
 * default list (`defaultText`, from the `materials` table's `relatedTo`) —
 * still only a draft, so backing out adds nothing. Once there's real text in
 * the field, opening again starts from that text: a PM's edits aren't
 * overwritten by reopening the popup.
 */
export function MaterialDialog({
  value,
  defaultText,
  onChange,
  trigger,
}: {
  value: string
  defaultText: string
  onChange: (next: string) => void
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState("")

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Seed on the way in; on the way out the draft is simply abandoned.
        if (next) setDraft(value.trim() ? value : defaultText)
        setOpen(next)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add material</DialogTitle>
          <DialogDescription>Free text, sent to the warehouse as-is.</DialogDescription>
        </DialogHeader>

        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={12}
          autoFocus
          placeholder="List the materials needed for this job"
          className="flex-1 font-mono text-sm"
        />

        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              onChange(draft)
              setOpen(false)
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
