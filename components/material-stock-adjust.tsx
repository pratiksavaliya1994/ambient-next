"use client"

import { ArrowRightIcon, PackageCheckIcon, PackagePlusIcon, ScaleIcon } from "lucide-react"
import * as React from "react"

import { QuantityStepper } from "@/components/quantity-stepper"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { MaterialItem } from "@/lib/bubble/material-items-types"
import { adjustStockAction } from "@/app/(app)/materials/actions"

type Mode = "receive" | "correct"

/**
 * The page's "Adjust stock" action. Closing it throws the half-filled form
 * away (the popup unmounts), and a confirmed adjustment closes it too.
 */
export function MaterialStockAdjustDialog({ item }: { item: MaterialItem }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <ScaleIcon />
            Adjust stock
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            Receive a delivery from a supplier, or correct the count after a stocktake.
          </DialogDescription>
        </DialogHeader>
        <MaterialStockAdjust item={item} onAdjusted={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Receive (add n) or correct to a count (set to n), behind a confirm that
 * states the result — "Stock goes from 12 to 20".
 *
 * The confirm exists because a second press **is** a second adjustment: the
 * action mints a fresh idempotency key per call, which makes Bubble's own
 * retries safe but can't tell a double click from two real deliveries. The
 * numbers here are this render's; a correct re-reads stock on the server, so
 * the delta it sends is from the live count, not this one.
 */
function MaterialStockAdjust({ item, onAdjusted }: { item: MaterialItem; onAdjusted: () => void }) {
  const [mode, setMode] = React.useState<Mode>("receive")
  const [quantity, setQuantity] = React.useState(0)
  const [notes, setNotes] = React.useState("")
  const [confirming, setConfirming] = React.useState(false)

  const after = mode === "receive" ? item.stockQty + quantity : quantity
  const ready = mode === "receive" ? quantity > 0 : quantity !== item.stockQty

  function changeMode(next: Mode) {
    setMode(next)
    // A count starts from what the shelf should hold; a receipt from nothing.
    setQuantity(next === "correct" ? Math.max(0, item.stockQty) : 0)
  }

  function done() {
    setConfirming(false)
    onAdjusted()
  }

  return (
    <FieldGroup className="gap-4">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[mode]}
        onValueChange={(next) => next[0] && changeMode(next[0] as Mode)}
      >
        <ToggleGroupItem value="receive">
          <PackagePlusIcon />
          Receive
        </ToggleGroupItem>
        <ToggleGroupItem value="correct">
          <ScaleIcon />
          Correct to count
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Field>
          <FieldLabel>{mode === "receive" ? "Quantity received" : "Counted on the shelf"}</FieldLabel>
          <QuantityStepper value={quantity} onChange={setQuantity} label={item.unit || "unit"} />
        </Field>
        <Field>
          <FieldLabel htmlFor="adjustNotes">Notes</FieldLabel>
          <Input
            id="adjustNotes"
            value={notes}
            maxLength={500}
            placeholder={mode === "receive" ? "Supplier, PO number" : "Stocktake, damaged bags"}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </div>

      <Field orientation="horizontal" className="flex-wrap justify-between gap-2">
        <FieldDescription className="flex items-center gap-1.5 tabular-nums">
          {item.stockQty} <ArrowRightIcon className="size-3.5" /> {after} {item.unit}
        </FieldDescription>
        <Button type="button" disabled={!ready} onClick={() => setConfirming(true)}>
          <PackageCheckIcon />
          {mode === "receive" ? "Receive stock" : "Correct stock"}
        </Button>
      </Field>

      <StockAdjustConfirm
        open={confirming}
        onOpenChange={setConfirming}
        item={item}
        mode={mode}
        quantity={quantity}
        notes={notes}
        after={after}
        onDone={done}
      />
    </FieldGroup>
  )
}

function StockAdjustConfirm({
  open,
  onOpenChange,
  item,
  mode,
  quantity,
  notes,
  after,
  onDone,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  item: MaterialItem
  mode: Mode
  quantity: number
  notes: string
  after: number
  onDone: () => void
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await adjustStockAction({ itemId: item.id, mode, quantity, notes })
      if (result.status === "error" || result.status === "invalid") return setError(result.message)

      setError(null)
      toast.add({
        title: result.status === "saved" && result.unchanged ? "Stock already matched" : "Stock updated",
        description: result.status === "saved" ? `${item.name}: ${result.stockQty} ${item.unit} in stock.` : undefined,
      })
      onDone()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "receive" ? `Receive ${quantity} ${item.unit}?` : "Correct the count?"}</DialogTitle>
          <DialogDescription>
            Stock goes from {item.stockQty} to {after} {item.unit}. This is recorded in the history as{" "}
            {mode === "receive" ? "a receipt" : "an adjustment"}.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && mode === "correct" && (
          <p className="text-sm text-muted-foreground">
            If stock moved since this page loaded, the count still wins — it&rsquo;s set to {quantity}.
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button onClick={confirm} disabled={pending}>
            {pending ? <Spinner /> : <PackageCheckIcon />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
