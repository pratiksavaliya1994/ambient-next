"use client"

import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { StockTakeTool } from "@/lib/tools/stock-take"

/**
 * Everything ticked, in one place — the full list is ~600 rows, so checking or
 * undoing a pick there means scrolling to find it again.
 *
 * Newest first: a `Set` keeps insertion order, so reversing it puts the tool
 * just ticked at the front, where the person ticking it is already looking.
 */
export function StockTakeSelected({
  tools,
  location,
  selected,
  onChange,
}: {
  tools: StockTakeTool[]
  location: string
  selected: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
}) {
  const byId = new Map(tools.map((tool) => [tool.id, tool]))
  const picked = [...selected]
    .reverse()
    .map((id) => byId.get(id))
    .filter((tool): tool is StockTakeTool => tool !== undefined)

  function remove(id: string) {
    const next = new Set(selected)
    next.delete(id)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Selected <span className="text-muted-foreground">· {picked.length}</span>
        </h2>
        {picked.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange(new Set())}>
            Clear all
          </Button>
        )}
      </div>

      {picked.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing ticked yet. Tools you tick show up here.</p>
      ) : (
        <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {picked.map((tool) => (
            <li
              key={tool.id}
              className="flex max-w-full items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-0.5 pl-2.5 text-sm"
            >
              <span className="truncate">{tool.name}</span>
              {tool.location !== location && (
                <span className="truncate text-xs text-muted-foreground">· moving</span>
              )}
              <Button
                size="icon-xs"
                variant="ghost"
                className="rounded-full"
                onClick={() => remove(tool.id)}
                aria-label={`Remove ${tool.name}`}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
