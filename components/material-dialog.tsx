"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
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
 * Nothing is buffered here: `onChange` commits straight to the form on every
 * keystroke, same as `ToolPickerDialog`'s selection — closing the dialog has
 * nothing of its own left to discard.
 *
 * Opening it while the field is still empty pre-fills it from the `toDo`'s
 * default list (`defaultText`, from the `materials` table's `relatedTo`).
 * Once there's real text in it, opening again leaves it alone — a PM's edits
 * aren't overwritten by reopening the popup.
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
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open && !value.trim() && defaultText) onChange(defaultText)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add material</DialogTitle>
          <DialogDescription>Free text, sent to the warehouse as-is.</DialogDescription>
        </DialogHeader>

        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={12}
          autoFocus
          placeholder="List the materials needed for this job"
          className="flex-1 font-mono text-sm"
        />

        <DialogFooter>
          <DialogClose render={<Button type="button" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
