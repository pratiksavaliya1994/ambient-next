"use client"

import { useState, useTransition } from "react"
import { PlusIcon, SearchIcon } from "lucide-react"

import { searchToolsAction } from "@/app/(app)/requests/[requestId]/assign/actions"
import { ToolRow } from "@/components/tool-row"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { ItemGroup } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import type { CandidateTool, Conflict } from "@/lib/bubble/assigned-tools-types"

/** Bubble's `text contains` on a one-letter needle is the whole table. */
const MIN_QUERY = 2

/**
 * Adding a tool nobody asked for.
 *
 * The pool here is the **whole** `tools` table, so it is fetched lazily —
 * one `searchToolsAction` call per search, only while this dialog is open —
 * rather than shipped with the page. It is deliberately not filtered by type:
 * tools with a blank or dangling `tools.type` are invisible to the slot
 * candidates and this is the only way to reach them.
 */
export function ExtraToolsPicker({
  picked,
  conflicts,
  onAdd,
  onRemove,
}: {
  picked: Set<string>
  conflicts: Record<string, Conflict>
  onAdd: (tool: CandidateTool) => void
  onRemove: (toolId: string) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CandidateTool[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function runSearch(event: React.FormEvent) {
    event.preventDefault()
    const needle = query.trim()
    if (needle.length < MIN_QUERY) {
      setError(`Type at least ${MIN_QUERY} characters.`)
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        setResults(await searchToolsAction(needle))
      } catch {
        setError("Bubble didn't answer. Try again.")
      }
    })
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PlusIcon />
            Add extra tool
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add extra tool</DialogTitle>
          <DialogDescription>
            Search every tool by name, not just the types this request asked for. Anything added here is marked as an
            extra.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={runSearch}>
          <InputGroup>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search every tool"
              autoFocus
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" size="xs" disabled={pending}>
                {pending ? <Spinner /> : "Search"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {pending ? (
          <Empty className="border py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Spinner />
              </EmptyMedia>
              <EmptyTitle>Searching…</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : results === null ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyTitle>Nothing searched yet</EmptyTitle>
              <EmptyDescription>Type part of a tool&rsquo;s name and search.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : results.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyTitle>No tools match</EmptyTitle>
              <EmptyDescription>
                Nothing named like that is available. Tools marked for repair or maintenance are never offered.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="min-h-0 flex-1 gap-1 overflow-y-auto rounded-lg border p-1">
            {results.map((tool) => (
              <ToolRow
                key={tool.id}
                tool={tool}
                conflict={conflicts[tool.id]}
                picked={picked.has(tool.id)}
                usedElsewhere={false}
                onAdd={() => onAdd(tool)}
                onRemove={() => onRemove(tool.id)}
              />
            ))}
          </ItemGroup>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
