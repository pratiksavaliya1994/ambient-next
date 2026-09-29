"use client"

import { PlusIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { MaterialLineInput } from "@/lib/schemas/material"

/**
 * A line for something the catalogue doesn't stock — a description, and
 * optionally how many and of what. No quantity means one lot; the warehouse
 * approves it whole or not at all.
 *
 * **No `<form>` element**: this renders inside a dialog that is itself inside
 * the request form's React tree, and a submit here would bubble through the
 * portal to the request form's `onSubmit`. Enter in any field adds the line
 * instead, by hand.
 */
export function MaterialOtherItemForm({ onAdd }: { onAdd: (line: MaterialLineInput) => void }) {
  const [name, setName] = React.useState("")
  const [quantity, setQuantity] = React.useState("")
  const [unit, setUnit] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  function add() {
    const trimmed = name.trim()
    if (!trimmed) return setError("Describe the item.")

    const parsed = quantity.trim() === "" ? null : Number(quantity)
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 99999)) {
      return setError("Quantity is a whole number, 1 or more — or leave it blank for one lot.")
    }

    onAdd({ kind: "NonInventory", name: trimmed.slice(0, 200), quantity: parsed, unit: unit.trim().slice(0, 40) })
    setName("")
    setQuantity("")
    setUnit("")
    setError(null)
  }

  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    add()
  }

  return (
    <FieldGroup className="gap-4">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="otherName">What&rsquo;s needed</FieldLabel>
        <Input
          id="otherName"
          value={name}
          maxLength={200}
          placeholder="Rental scissor lift, special-order grout"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={onEnter}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="otherQuantity">Quantity</FieldLabel>
          <Input
            id="otherQuantity"
            type="number"
            inputMode="numeric"
            min={1}
            value={quantity}
            placeholder="Optional"
            onChange={(event) => setQuantity(event.target.value)}
            onKeyDown={onEnter}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="otherUnit">Unit</FieldLabel>
          <Input
            id="otherUnit"
            value={unit}
            maxLength={40}
            placeholder="Optional"
            onChange={(event) => setUnit(event.target.value)}
            onKeyDown={onEnter}
          />
        </Field>
      </div>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <FieldDescription>Not from stock, so the warehouse approves it rather than drawing it.</FieldDescription>
      )}
      <Button type="button" variant="secondary" onClick={add}>
        <PlusIcon />
        Add item
      </Button>
    </FieldGroup>
  )
}
