"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"
import type { z } from "zod"

import { displayNameOf, requireSession } from "@/lib/auth/session"
import {
  adjustMaterialStock,
  createMaterialItem,
  findMaterialNameClash,
  getMaterialItem,
  updateMaterialItem,
} from "@/lib/bubble/material-items"
import {
  adjustStockSchema,
  materialItemCreateSchema,
  materialItemEditSchema,
  materialNameCheckSchema,
} from "@/lib/schemas/material"
import type {
  AdjustStockState,
  MaterialItemCreateState,
  MaterialItemEditState,
  MaterialNameCheck,
} from "@/app/(app)/materials/action-state"

/**
 * The catalogue's writes. Items are plain Data API rows; **stock only moves
 * through `adjust-material-stock`**, so every change to it is audited.
 *
 * The name probe is a convenience and the create/edit actions are the guard —
 * they re-run it just before writing. That narrows the duplicate window; it
 * can't close it, because Bubble has no transactions or unique constraints.
 */

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message
  }
  return fieldErrors
}

function bubbleMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback}: ${error.message}` : `${fallback}.`
}

export async function checkMaterialNameAction(input: unknown): Promise<MaterialNameCheck> {
  await requireSession()

  const parsed = materialNameCheckSchema.safeParse(input)
  if (!parsed.success) return { status: "idle" }

  const { name, exceptId } = parsed.data
  try {
    const clash = await findMaterialNameClash(name, exceptId)
    return clash
      ? { status: "taken", name, itemId: clash.id, existingName: clash.name }
      : { status: "available", name }
  } catch {
    // A failed probe must not read as "free" *or* block the save.
    return { status: "unknown", name }
  }
}

export async function createMaterialItemAction(input: unknown): Promise<MaterialItemCreateState> {
  const session = await requireSession()

  const parsed = materialItemCreateSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "invalid", message: "Those material details aren't valid.", fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const { openingStock, ...fields } = parsed.data

  const clash = await findMaterialNameClash(fields.name)
  if (clash) {
    return {
      status: "invalid",
      message: "A material already has that name.",
      fieldErrors: { name: `"${clash.name}" already exists — pick a different name.` },
    }
  }

  let itemId: string
  try {
    itemId = await createMaterialItem(fields)
  } catch (error) {
    return { status: "error", message: bubbleMessage(error, "Couldn't create the material") }
  }

  // After the create, never part of it: a failed receive costs the opening
  // stock, not the item, and an `Adjust` on its page puts it right.
  let warning: string | undefined
  if (openingStock > 0) {
    try {
      await adjustMaterialStock({
        idempotencyKey: randomUUID(),
        materialId: itemId,
        delta: openingStock,
        reason: "Receive",
        byName: displayNameOf(session),
        notes: "Opening stock",
      })
    } catch {
      warning = "The material was created, but its opening stock didn't save. Receive it from the material's page."
    }
  }

  revalidatePath("/materials")
  return { status: "created", itemId, name: fields.name, warning }
}

/** A plain patch of the catalogue fields and `active`. Never `stockQty`. */
export async function updateMaterialItemAction(input: unknown): Promise<MaterialItemEditState> {
  await requireSession()

  const parsed = materialItemEditSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "invalid", message: "Those material details aren't valid.", fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const { itemId, ...patch } = parsed.data

  if (!(await getMaterialItem(itemId))) {
    return { status: "error", message: "That material no longer exists in Bubble." }
  }

  const clash = await findMaterialNameClash(patch.name, itemId)
  if (clash) {
    return {
      status: "invalid",
      message: "A material already has that name.",
      fieldErrors: { name: `"${clash.name}" already exists — pick a different name.` },
    }
  }

  try {
    await updateMaterialItem(itemId, patch)
  } catch (error) {
    return { status: "error", message: bubbleMessage(error, "Couldn't save the material") }
  }

  revalidatePath("/materials")
  revalidatePath(`/materials/${itemId}`)
  return { status: "saved", itemId, name: patch.name }
}

/**
 * Receive adds `quantity`; correct re-reads the item and sends
 * `counted − stockQty`. The gap between that read and the write is the
 * accepted race in Known limits.
 *
 * The idempotency key is generated **here**, once per call — so the client
 * retry inside `client.ts` is safe, and only a second press of the button is a
 * second adjustment (which is why the form confirms first).
 */
export async function adjustStockAction(input: unknown): Promise<AdjustStockState> {
  const session = await requireSession()

  const parsed = adjustStockSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "invalid", message: "That adjustment isn't valid.", fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const { itemId, mode, quantity, notes } = parsed.data

  const item = await getMaterialItem(itemId)
  if (!item) return { status: "error", message: "That material no longer exists in Bubble." }

  const delta = mode === "receive" ? quantity : quantity - item.stockQty
  // Nothing to write, and an `Adjust` row with a zero delta would only be noise.
  if (delta === 0) return { status: "saved", stockQty: item.stockQty, unchanged: true }

  let stockQty: number
  try {
    stockQty = await adjustMaterialStock({
      idempotencyKey: randomUUID(),
      materialId: itemId,
      delta,
      reason: mode === "receive" ? "Receive" : "Adjust",
      byName: displayNameOf(session),
      notes,
    })
  } catch (error) {
    return { status: "error", message: bubbleMessage(error, "Bubble rejected the adjustment") }
  }

  revalidatePath("/materials")
  revalidatePath(`/materials/${itemId}`)
  return { status: "saved", stockQty }
}
