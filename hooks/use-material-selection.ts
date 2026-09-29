"use client"

import { useState } from "react"

import type { OutstandingMaterial } from "@/lib/trips/material-movement-types"

/**
 * The trip builder's material selection: `lineId → qty for this trip`.
 *
 * A line ticked on starts at **all of what's left** — the common case is
 * sending the whole line — and the stepper lowers it from there. Ticking off
 * forgets the quantity, so re-ticking starts full again.
 *
 * Nothing here is clamped against `outstanding` after the fact. The stepper
 * holds its own `1..outstanding`, and a stale quantity (another dispatcher
 * planned part of the line) is refused by name by `selectMaterialMovements`,
 * in the builder and again on the server.
 */
export function useMaterialSelection(initial: () => Map<string, number>) {
  const [quantities, setQuantities] = useState<Map<string, number>>(initial)

  function toggle(line: OutstandingMaterial, checked: boolean) {
    setQuantities((current) => {
      const next = new Map(current)
      if (checked) next.set(line.lineId, line.outstanding)
      else next.delete(line.lineId)
      return next
    })
  }

  function setQty(lineId: string, qty: number) {
    setQuantities((current) => new Map(current).set(lineId, qty))
  }

  /** A group's "All" / "Clear": every line at full, or none. */
  function setAll(lines: readonly OutstandingMaterial[], checked: boolean) {
    setQuantities((current) => {
      const next = new Map(current)
      for (const line of lines) {
        if (checked) next.set(line.lineId, next.get(line.lineId) ?? line.outstanding)
        else next.delete(line.lineId)
      }
      return next
    })
  }

  return { quantities, toggle, setQty, setAll }
}
