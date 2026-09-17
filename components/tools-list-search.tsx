"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { toolsListHref, type ToolsListParams } from "@/lib/tools/list-filters"

/**
 * The "All tools" tab's name search — an explicit submit, not a per-keystroke
 * filter, same idiom `request-search.tsx` and `tools-dashboard-filters.tsx`
 * both use: nothing re-fetches until Search is pressed (or Enter).
 */
export function ToolsListSearch({ current }: { current: ToolsListParams }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState(current.q)

  function runSearch(event: React.FormEvent) {
    event.preventDefault()
    startTransition(() => router.push(toolsListHref({ q: draft.trim() }, current)))
  }

  return (
    <form onSubmit={runSearch} className="flex min-w-0 max-w-md items-center gap-2">
      <InputGroup className="min-w-0">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search tool name…"
        />
        {draft && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="button" size="icon-xs" aria-label="Clear search text" onClick={() => setDraft("")}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : <SearchIcon data-icon="inline-start" />}
        Search
      </Button>
    </form>
  )
}
