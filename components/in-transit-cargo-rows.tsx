import Link from "next/link"
import { PackageIcon, WrenchIcon } from "lucide-react"

import { ToolStatusDots } from "@/components/tool-status-badges"
import type { InTransitFlag, InTransitItem, InTransitMaterial, InTransitTool } from "@/lib/trips/in-transit"
import { cn } from "@/lib/utils"

/**
 * The In Transit board's two kinds of line. **One shape, two colours**: both
 * share `CargoRow` — left edge, tint, glyph, name, a pill on the right — so
 * the spacing and weight are identical and only the colour says which kind it
 * is: tools in the cyan `tool` accent, materials in the magenta `material`
 * one, so both read at wall-screen distance. The pill holds a tool's type and
 * a material's quantity — the one detail each kind is read for.
 */

const TONES = {
  tool: {
    row: "border-l-tool bg-tool/5",
    icon: "text-tool-foreground",
    pill: "bg-tool/15 text-tool-foreground",
  },
  material: {
    row: "border-l-material bg-material/5",
    icon: "text-material-foreground",
    pill: "bg-material/15 text-material-foreground",
  },
} as const

/** Everything the one-line row has no room for, back on hover. */
function rowTitle(item: InTransitItem, detail: string): string {
  const route = item.flag === "no-trip" ? "No trip record" : `${item.from || "?"} → ${item.refusedBy ?? item.destination}`
  return [item.name, detail, route, item.refusedBy && `Refused by ${item.refusedBy}`].filter(Boolean).join(" · ")
}

export function InTransitToolRow({ tool }: { tool: InTransitTool }) {
  return (
    <CargoRow
      kind="tool"
      title={rowTitle(tool, [tool.typeName, tool.condition].filter(Boolean).join(" · "))}
      name={
        <Link href={`/tools/${tool.toolId}`} className="hover:text-primary hover:underline">
          {tool.name}
        </Link>
      }
      pill={tool.typeName}
      flag={tool.flag}
    >
      <ToolStatusDots status="" condition={tool.condition} />
    </CargoRow>
  )
}

export function InTransitMaterialRow({ material }: { material: InTransitMaterial }) {
  return (
    <CargoRow
      kind="material"
      title={rowTitle(material, material.qtyLabel)}
      name={material.name}
      pill={material.qtyLabel}
      flag={material.flag}
    />
  )
}

/** The shared line. `children` sits between the pill and the flag chip (a tool's condition glyph). */
function CargoRow({
  kind,
  title,
  name,
  pill,
  flag,
  children,
}: {
  kind: keyof typeof TONES
  title: string
  name: React.ReactNode
  pill: string
  flag: InTransitFlag | null
  children?: React.ReactNode
}) {
  const tone = TONES[kind]
  const Icon = kind === "tool" ? WrenchIcon : PackageIcon

  return (
    <div className={cn("flex items-center gap-1.5 rounded-sm border-l-2 py-0.5 pr-1 pl-1.5 text-xs", tone.row)} title={title}>
      <Icon className={cn("size-3 shrink-0", tone.icon)} aria-label={kind === "tool" ? "Tool" : "Material"} />
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {pill && (
        <span className={cn("max-w-[45%] shrink-0 truncate rounded px-1 text-[10px] font-semibold tabular-nums", tone.pill)}>
          {pill}
        </span>
      )}
      {children}
      {flag && (
        <span className="shrink-0 rounded bg-status-attention/15 px-1 text-[10px] font-medium whitespace-nowrap text-status-attention-foreground">
          {flag === "refused" ? "Refused" : "No trip"}
        </span>
      )}
    </div>
  )
}
