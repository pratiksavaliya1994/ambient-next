"use client"

import { Fragment } from "react"
import { CheckIcon, PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react"

import { ToolRow } from "@/components/tool-row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ItemGroup } from "@/components/ui/item"
import type { CandidateTool, ToolRequestClaim } from "@/lib/bubble/assigned-tools-types"
import { missingParts, type CandidateGroup, type MissingPart, type SetShape, type SetShortfall } from "@/lib/bubble/tool-sets"

type PickState = {
  chosenIds: Set<string>
  usedElsewhere: Set<string>
  lockedIds: Set<string>
  heldElsewhere: Map<string, ToolRequestClaim>
  onAdd: (tools: CandidateTool[]) => void
  onRemove: (toolIds: string[]) => void
}

function rowFor(tool: CandidateTool, pick: PickState) {
  return (
    <ToolRow
      key={tool.id}
      tool={tool}
      picked={pick.chosenIds.has(tool.id)}
      usedElsewhere={pick.usedElsewhere.has(tool.id)}
      locked={pick.lockedIds.has(tool.id)}
      heldBy={pick.heldElsewhere.get(tool.id)}
      onAdd={() => pick.onAdd([tool])}
      onRemove={() => pick.onRemove([tool.id])}
    />
  )
}

/**
 * The slot dialog's list: each tool set (see `lib/bubble/tool-sets.ts`) under
 * its own header, then every tool of the type that is no set part — labelled
 * as such only when the type has sets, so an ordinary type lists as before.
 */
export function CandidateGroups({
  groups,
  candidates,
  setShape,
  ...pick
}: PickState & { groups: CandidateGroup[]; candidates: CandidateTool[]; setShape: SetShape }) {
  const firstLoose = groups.findIndex((group) => group.kind === "single")
  const hasSets = setShape.parts.length > 0

  return (
    <ItemGroup className="min-h-0 flex-1 gap-1 overflow-y-auto rounded-lg border p-1">
      {groups.map((group, index) =>
        group.kind === "set" ? (
          <ToolSetGroup
            key={`set-${group.number}`}
            number={group.number}
            tools={group.tools}
            total={setShape.parts.length}
            missing={missingParts(setShape, group.number, candidates, candidates)}
            pick={pick}
          />
        ) : (
          <Fragment key={group.tool.id}>
            {hasSets && index === firstLoose && (
              <p className="px-2 pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Other tools of this type
              </p>
            )}
            {rowFor(group.tool, pick)}
          </Fragment>
        )
      )}
    </ItemGroup>
  )
}

/**
 * One tool set — its free parts under a header that adds them all in one
 * press. Each part stays an ordinary `ToolRow`, so picking only some works as
 * before. `missing` says up front why a set is short: a part that's busy, or
 * one the set should have but has no tool on file for.
 */
function ToolSetGroup({
  number,
  tools,
  total,
  missing,
  pick,
}: {
  number: string
  /** The parts of this set left visible by the search. */
  tools: CandidateTool[]
  /** How many parts the set is defined with. */
  total: number
  missing: MissingPart[]
  pick: PickState
}) {
  const addable = tools.filter((tool) => !pick.usedElsewhere.has(tool.id))
  const removable = tools.filter((tool) => pick.chosenIds.has(tool.id) && !pick.lockedIds.has(tool.id))
  const anyPicked = tools.some((tool) => pick.chosenIds.has(tool.id))
  const shortBy = missing.map((part) => `${part.name} ${part.reason}`).join(", ")

  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold">Set #{number}</span>
          <span className="truncate text-xs text-muted-foreground" title={shortBy}>
            {total - missing.length} of {total} free{shortBy && ` · ${shortBy}`}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {addable.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => pick.onAdd(addable)}>
              <PlusIcon />
              {anyPicked ? `Add ${addable.length} more` : `Add set (${addable.length})`}
            </Button>
          ) : (
            anyPicked && (
              <Badge className="border-transparent bg-status-ok/15 text-status-ok-foreground">
                <CheckIcon />
                Set added
              </Badge>
            )
          )}
          {addable.length === 0 && removable.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => pick.onRemove(removable.map((tool) => tool.id))}
              title={`Remove set #${number}`}
              aria-label={`Remove set #${number}`}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 pl-3">{tools.map((tool) => rowFor(tool, pick))}</div>
    </div>
  )
}

/**
 * The slot card's warning when the picks don't make whole sets — counted by
 * part, so mixing set numbers is fine (see `setShortfall`). A warning, not a
 * block: a short load is a supported outcome here, the same as an unfilled
 * slot; this only makes sure it is a deliberate one.
 */
export function SetGapNotice({ shortfall }: { shortfall: SetShortfall }) {
  if (shortfall.missing.length === 0) return null

  return (
    <div className="flex items-start gap-2 rounded-md border border-status-attention/40 bg-status-attention/10 px-2.5 py-1.5 text-xs text-status-attention-foreground">
      <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
      <p className="min-w-0">
        {shortfall.sets === 1 ? "Not a full set" : `Not ${shortfall.sets} full sets`} — missing{" "}
        {shortfall.missing.map((entry, index) => (
          <span key={entry.part}>
            {index > 0 && ", "}
            <span className="font-medium">
              {entry.part}
              {entry.short > 1 && ` ×${entry.short}`}
            </span>{" "}
            ({entry.free > 0 ? `${entry.free} free to add` : "none free"})
          </span>
        ))}
      </p>
    </div>
  )
}
