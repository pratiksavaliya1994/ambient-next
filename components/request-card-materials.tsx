import { quantityLabel } from "@/components/material-line-row"
import type { MaterialLine } from "@/lib/bubble/requested-materials-types"

/**
 * The materials box on a `/requests` card — the tools box's twin, so a card
 * reads as one list of what the request wants. Structured lines when there are
 * any, otherwise the legacy note; never both (see `listMaterialLines`).
 */
export function RequestCardMaterials({ lines, legacy }: { lines: MaterialLine[]; legacy: string[] }) {
  if (lines.length === 0 && legacy.length === 0) return null
  const count = lines.length || legacy.length

  return (
    <div className="overflow-hidden rounded-lg border bg-background/70">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {lines.length > 0 ? "Materials" : "Materials (legacy note)"}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count} {count === 1 ? "line" : "lines"}
        </span>
      </div>

      <ul className="divide-y">
        {lines.length > 0
          ? lines.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-4 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm wrap-anywhere">{line.name}</span>
                <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums">
                  {quantityLabel(line)}
                </span>
              </li>
            ))
          : legacy.map((text, index) => (
              <li key={index} className="px-3 py-2 text-sm wrap-anywhere">
                {text}
              </li>
            ))}
      </ul>
    </div>
  )
}
