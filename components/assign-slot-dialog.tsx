"use client"

import { useMemo, useState } from "react"
import { PlusIcon, SearchIcon } from "lucide-react"

import { CandidateGroups } from "@/components/tool-set-group"
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
import type { AssignSlot, CandidateTool, ToolRequestClaim } from "@/lib/bubble/assigned-tools-types"
import { groupCandidates, type SetShape } from "@/lib/bubble/tool-sets"

/**
 * The slot's "Add" dialog: search over that type's candidates, with any tool
 * sets (see `lib/bubble/tool-sets.ts`) gathered under one header each so a
 * whole set goes on in one press. Types without sets list exactly as before.
 */
export function AssignSlotDialog({
  slot,
  chosen,
  candidates,
  setShape,
  usedElsewhere,
  lockedIds,
  heldElsewhere,
  onAdd,
  onRemove,
}: {
  slot: AssignSlot
  chosen: CandidateTool[]
  candidates: CandidateTool[]
  setShape: SetShape
  usedElsewhere: Set<string>
  lockedIds: Set<string>
  heldElsewhere: Map<string, ToolRequestClaim>
  onAdd: (tools: CandidateTool[]) => void
  onRemove: (toolIds: string[]) => void
}) {
  const [query, setQuery] = useState("")

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const visible = needle ? candidates.filter((tool) => tool.name.toLowerCase().includes(needle)) : candidates
    return groupCandidates(visible, setShape.parts)
  }, [candidates, query, setShape.parts])

  const chosenIds = new Set(chosen.map((tool) => tool.id))

  return (
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
            {candidates.length} {candidates.length === 1 ? "tool" : "tools"} of this type currently free to assign.
          </DialogDescription>
        </DialogHeader>

        <SearchField value={query} onChange={setQuery} />

        {groups.length === 0 ? (
          <NoCandidates slot={slot} none={candidates.length === 0} />
        ) : (
          <CandidateGroups
            groups={groups}
            candidates={candidates}
            setShape={setShape}
            chosenIds={chosenIds}
            usedElsewhere={usedElsewhere}
            lockedIds={lockedIds}
            heldElsewhere={heldElsewhere}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoCandidates({ slot, none }: { slot: AssignSlot; none: boolean }) {
  return (
    <Empty className="border border-dashed py-8">
      <EmptyHeader>
        <EmptyTitle>{none ? "No tools of this type" : "No tools match"}</EmptyTitle>
        <EmptyDescription>
          {none
            ? slot.typeId
              ? "Every tool of this type is busy, out of service, or there are none on file. Add an extra tool instead."
              : "This requested name doesn't match a toolstype row, so there are no candidates to offer. Add an extra tool instead."
            : "Try a different search."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <InputGroup>
      <InputGroupInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search tools"
        autoFocus
      />
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
    </InputGroup>
  )
}
