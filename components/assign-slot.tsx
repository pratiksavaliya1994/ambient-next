"use client"

import { useMemo, useState } from "react"
import { PlusIcon, SearchIcon, XIcon } from "lucide-react"

import { ToolRow } from "@/components/tool-row"
import { Badge } from "@/components/ui/badge"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ItemGroup } from "@/components/ui/item"
import { assignedLabel, type AssignSlot, type CandidateTool, type Conflict } from "@/lib/bubble/assigned-tools-types"
import { cn } from "@/lib/utils"

/**
 * One requested tool type: how many were asked for, which physical tools fill
 * it so far, and a dialog to add more from that type's candidates.
 *
 * The requested quantity bounds the slot in neither direction. Short is a
 * supported outcome, not an error, so an unfilled slot renders as the app's
 * existing dashed `Empty` idiom rather than as a validation failure — and long
 * is equally fine, since what a job needs is the loader's call, not a number
 * typed on the request. The count reads `N assigned · M requested` for exactly
 * that reason.
 */
export function AssignSlotCard({
  slot,
  chosen,
  candidates,
  conflicts,
  usedElsewhere,
  onAdd,
  onRemove,
}: {
  slot: AssignSlot
  chosen: CandidateTool[]
  candidates: CandidateTool[]
  conflicts: Record<string, Conflict>
  usedElsewhere: Set<string>
  onAdd: (tool: CandidateTool) => void
  onRemove: (toolId: string) => void
}) {
  const [query, setQuery] = useState("")

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return candidates
    return candidates.filter((tool) => tool.name.toLowerCase().includes(needle))
  }, [candidates, query])

  /** Enough on the truck to cover what was asked for. Not a cap — more is allowed. */
  const met = chosen.length >= slot.requested

  return (
    <div className="flex flex-col gap-2 border-b bg-muted/40 p-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold" title={slot.toolType}>
            {slot.toolType}
          </span>
          {slot.consumable ? (
            <Badge variant="outline">Consumable</Badge>
          ) : (
            <Badge
              className={cn(
                "tabular-nums",
                met
                  ? "border-transparent bg-status-ok/15 text-status-ok-foreground"
                  : "border-transparent bg-background text-muted-foreground"
              )}
            >
              {assignedLabel(chosen.length, slot.requested)}
            </Badge>
          )}
        </div>

        {!slot.consumable && (
          <Dialog>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm">
                  <PlusIcon />
                  Add
                </Button>
              }
            />
            <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="wrap-anywhere">{slot.toolType}</DialogTitle>
                <DialogDescription>
                  {candidates.length} {candidates.length === 1 ? "tool" : "tools"} of this type. Tools already on
                  another request over these dates are shown but can&rsquo;t be picked.
                </DialogDescription>
              </DialogHeader>

              <InputGroup>
                <InputGroupInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tools"
                  autoFocus
                />
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
              </InputGroup>

              {visible.length === 0 ? (
                <Empty className="border border-dashed py-8">
                  <EmptyHeader>
                    <EmptyTitle>{candidates.length === 0 ? "No tools of this type" : "No tools match"}</EmptyTitle>
                    <EmptyDescription>
                      {candidates.length === 0
                        ? slot.typeId
                          ? "Every tool of this type is out of service, or there are none on file. Add an extra tool instead."
                          : "This requested name doesn't match a toolstype row, so there are no candidates to offer. Add an extra tool instead."
                        : "Try a different search."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ItemGroup className="min-h-0 flex-1 gap-1 overflow-y-auto rounded-lg border p-1">
                  {visible.map((tool) => {
                    const picked = chosen.some((entry) => entry.id === tool.id)
                    return (
                      <ToolRow
                        key={tool.id}
                        tool={tool}
                        conflict={conflicts[tool.id]}
                        picked={picked}
                        usedElsewhere={usedElsewhere.has(tool.id)}
                        onAdd={() => onAdd(tool)}
                        onRemove={() => onRemove(tool.id)}
                      />
                    )
                  })}
                </ItemGroup>
              )}

              <DialogFooter>
                <DialogClose render={<Button variant="outline">Done</Button>} />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {slot.consumable ? (
        <p className="text-sm text-muted-foreground">Consumable — nothing to assign.</p>
      ) : chosen.length === 0 ? (
        <Empty className="border border-dashed py-6">
          <EmptyHeader>
            <EmptyTitle className="text-sm">Nothing assigned</EmptyTitle>
            <EmptyDescription>A slot can go out empty — leave it if there is nothing to send.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-1.5 border-l-2 border-muted-foreground/25 pl-3">
          {chosen.map((tool) => (
            <li key={tool.id} className="flex items-center gap-3 rounded-md border bg-background px-2.5 py-1.5">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm" title={tool.name}>
                  {tool.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {tool.location}
                  {tool.floor && ` · Floor ${tool.floor}`}
                  {` · ${tool.status}`}
                </span>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => onRemove(tool.id)} aria-label={`Remove ${tool.name}`}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
