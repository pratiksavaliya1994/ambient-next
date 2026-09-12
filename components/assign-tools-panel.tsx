"use client"

import { useMemo, useState, useTransition } from "react"
import { AlertCircleIcon, RotateCcwIcon, SaveIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { INITIAL_CREATE_STATE, type CreateRequestState } from "@/app/(app)/requests/action-state"
import { assignToolsAction } from "@/app/(app)/requests/[requestId]/assign/actions"
import { AssignSlotCard } from "@/components/assign-slot"
import { ExtraToolsPicker } from "@/components/extra-tools-picker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  assignedLabel,
  type AssignmentEntry,
  type AssignSlot,
  type CandidateTool,
  type Conflict,
} from "@/lib/bubble/assigned-tools-types"

/**
 * The assign screen's one client island.
 *
 * **Nothing is written until Save**, the same rule the create form follows:
 * every pick lives in this component's state, so abandoning the page leaves
 * Bubble untouched. That matters here for the same reason it did there — the
 * old Bubble UI stages selections in `user.tempTools` and never cleans up.
 *
 * Save sends the **whole** set, not a diff: `create-assigned-tool` deletes the
 * request's rows before recreating them, so a tool removed here and saved is
 * how an unassign happens, and saving the same thing twice is a no-op.
 *
 * State is three pieces: which tools fill each slot (keyed by the slot's
 * **stored** `toolType` string), which are extras, and a growing pool of
 * everything known about a tool id — the pool grows because the extras dialog
 * fetches tools the page never loaded.
 */
export function AssignToolsPanel({
  requestId,
  slots,
  extraToolIds,
  pool,
  conflicts,
  unresolvedSlots,
}: {
  requestId: string
  slots: AssignSlot[]
  extraToolIds: string[]
  pool: CandidateTool[]
  conflicts: Record<string, Conflict>
  /** Requested names that matched no `toolstype` row — those slots offer no candidates. */
  unresolvedSlots: number
}) {
  const [picks, setPicks] = useState<Map<string, string[]>>(
    () => new Map(slots.map((slot) => [slot.toolType, slot.toolIds]))
  )
  const [extras, setExtras] = useState<string[]>(extraToolIds)
  const [known, setKnown] = useState<Map<string, CandidateTool>>(
    () => new Map(pool.map((tool) => [tool.id, tool]))
  )
  const [state, setState] = useState<CreateRequestState>(INITIAL_CREATE_STATE)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const candidatesByType = useMemo(() => {
    const byType = new Map<string, CandidateTool[]>()
    for (const tool of known.values()) {
      if (!tool.typeId) continue
      const list = byType.get(tool.typeId) ?? []
      list.push(tool)
      byType.set(tool.typeId, list)
    }
    return byType
  }, [known])

  const usedIds = useMemo(() => {
    const used = new Set<string>(extras)
    for (const ids of picks.values()) for (const id of ids) used.add(id)
    return used
  }, [picks, extras])

  const requested = slots.filter((slot) => !slot.consumable).reduce((sum, slot) => sum + slot.requested, 0)
  const filled = [...picks.values()].reduce((sum, ids) => sum + ids.length, 0)

  const dirty =
    extras.join(",") !== extraToolIds.join(",") ||
    slots.some((slot) => (picks.get(slot.toolType) ?? []).join(",") !== slot.toolIds.join(","))

  function remember(tool: CandidateTool) {
    if (known.has(tool.id)) return
    setKnown((current) => new Map(current).set(tool.id, tool))
  }

  /**
   * A slot takes as many tools of its type as are picked — the requested
   * quantity is guidance about what the job needs, not a ceiling on what goes
   * on the truck. Asking for one grinder and sending three is a normal load.
   *
   * What still holds is that one physical tool fills one place: the dialog
   * disables a row that is already picked or used elsewhere, and this guard is
   * what actually enforces it, since a stale render or a double click would
   * otherwise slip a duplicate through.
   */
  function addToSlot(toolType: string, tool: CandidateTool) {
    const chosen = picks.get(toolType) ?? []
    if (chosen.includes(tool.id) || usedIds.has(tool.id)) return

    remember(tool)
    setPicks((current) => {
      const next = new Map(current)
      next.set(toolType, [...(next.get(toolType) ?? []), tool.id])
      return next
    })
  }

  function removeFromSlot(toolType: string, toolId: string) {
    setPicks((current) => {
      const next = new Map(current)
      next.set(
        toolType,
        (next.get(toolType) ?? []).filter((id) => id !== toolId)
      )
      return next
    })
  }

  function addExtra(tool: CandidateTool) {
    if (usedIds.has(tool.id)) return
    remember(tool)
    setExtras((current) => [...current, tool.id])
  }

  function removeExtra(toolId: string) {
    setExtras((current) => current.filter((id) => id !== toolId))
  }

  function reset() {
    setPicks(new Map(slots.map((slot) => [slot.toolType, slot.toolIds])))
    setExtras(extraToolIds)
    setState(INITIAL_CREATE_STATE)
  }

  /**
   * The slot's key is its **stored** `toolType` string — the same value
   * `buildSlots` grouped on, carried back to Bubble unchanged so a later
   * `toolstype` rename can't reshuffle an old request's slots. An extra has no
   * slot, so it carries its own type's name purely as a label.
   */
  function entries(): AssignmentEntry[] {
    const list: AssignmentEntry[] = []
    for (const slot of slots) {
      for (const toolId of picks.get(slot.toolType) ?? []) {
        list.push({ toolId, extra: false, toolType: slot.toolType })
      }
    }
    for (const toolId of extras) {
      list.push({ toolId, extra: true, toolType: known.get(toolId)?.typeName ?? "" })
    }
    return list
  }

  function save() {
    startTransition(async () => {
      const result = await assignToolsAction({ requestId, assignments: entries() })
      setState(result)

      if (result.status === "created") {
        toast.add({
          title: result.warning ? "Assignment saved with a warning" : "Assignment saved",
          description: result.warning ?? `${result.job} has its tools.`,
        })
        router.push(`/requests/${requestId}`)
      }
    })
  }

  const extraTools = extras.map((id) => known.get(id)).filter((tool): tool is CandidateTool => Boolean(tool))

  return (
    <div className="flex flex-col gap-4">
      {(state.status === "error" || state.status === "invalid") && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not save the assignment</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {/* The rows committed and a `tools.status` write didn't — not a failure,
          but not silent either: saving again is what clears it. */}
      {state.status === "created" && state.warning && (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>Saved, with one thing outstanding</AlertTitle>
          <AlertDescription>{state.warning}</AlertDescription>
        </Alert>
      )}

      <Card data-size="sm">
        <CardHeader>
          <CardTitle className="text-base">Requested tools</CardTitle>
          <CardDescription className="tabular-nums">
            {assignedLabel(filled, requested)}
            {unresolvedSlots > 0 && ` · ${unresolvedSlots} unmatched ${unresolvedSlots === 1 ? "name" : "names"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {slots.length === 0 ? (
            <Empty className="mx-4 border border-dashed py-8">
              <EmptyHeader>
                <EmptyTitle>No tools requested</EmptyTitle>
                <EmptyDescription>
                  This request has no tool line, so there are no slots. Extras can still be added below.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="border-y">
              {slots.map((slot) => {
                const chosenIds = picks.get(slot.toolType) ?? []
                const chosen = chosenIds
                  .map((id) => known.get(id))
                  .filter((tool): tool is CandidateTool => Boolean(tool))

                return (
                  <AssignSlotCard
                    key={slot.toolType}
                    slot={slot}
                    chosen={chosen}
                    candidates={slot.typeId ? (candidatesByType.get(slot.typeId) ?? []) : []}
                    conflicts={conflicts}
                    usedElsewhere={usedIds}
                    onAdd={(tool) => addToSlot(slot.toolType, tool)}
                    onRemove={(toolId) => removeFromSlot(slot.toolType, toolId)}
                  />
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-size="sm">
        <CardHeader>
          <CardTitle className="text-base">Extra tools</CardTitle>
          <CardDescription>Anything going on the truck that nobody asked for.</CardDescription>
          <CardAction className="self-center">
            <ExtraToolsPicker
              picked={usedIds}
              conflicts={conflicts}
              onAdd={addExtra}
              onRemove={(toolId) => removeExtra(toolId)}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          {extraTools.length === 0 ? (
            <Empty className="border border-dashed py-6">
              <EmptyHeader>
                <EmptyTitle className="text-sm">No extras</EmptyTitle>
                <EmptyDescription>Most loads don&rsquo;t need any.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="rounded-lg bg-muted/40 p-3">
              <ul className="flex flex-col gap-1.5 border-l-2 border-muted-foreground/25 pl-3">
                {extraTools.map((tool) => (
                  <li
                    key={tool.id}
                    className="flex items-center gap-3 rounded-md border bg-background px-2.5 py-1.5"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm" title={tool.name}>
                        {tool.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {tool.typeName ?? "No type"} · {tool.location}
                      </span>
                    </div>
                    <Badge variant="outline">Extra</Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeExtra(tool.id)}
                      aria-label={`Remove ${tool.name}`}
                    >
                      <XIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky, because the slot list is as long as the request is big and the
          count is the thing a PM checks before saving. */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/95 p-3 backdrop-blur">
        <span className="text-sm text-muted-foreground tabular-nums">
          {assignedLabel(filled, requested)}
          {extraTools.length > 0 && ` · ${extraTools.length} extra`}
          {dirty && " · unsaved"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || pending} onClick={reset}>
            <RotateCcwIcon />
            Reset
          </Button>
          {/* `dirty` is derived from the props each render, and the action
              revalidates this route — so a successful save re-renders the page
              with the saved values and this falls back to disabled on its own. */}
          <Button size="sm" disabled={!dirty || pending} onClick={save}>
            {pending ? <Spinner /> : <SaveIcon />}
            Save assignment
          </Button>
        </div>
      </div>
    </div>
  )
}
