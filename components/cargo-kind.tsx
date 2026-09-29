import { PackageIcon, WrenchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Tool or material — the two kinds of cargo a trip carries.
 *
 * Every list that mixes them (the builder's pool, a stop's collect/drop blocks)
 * leads each line with this tile, so the kind reads before the name does. Tools
 * stay neutral; materials take the `material` accent, which the material rows
 * also tint themselves with.
 */
export type CargoKind = "tool" | "material"

export function CargoKindIcon({ kind, className }: { kind: CargoKind; className?: string }) {
  const Icon = kind === "tool" ? WrenchIcon : PackageIcon

  return (
    <span
      aria-label={kind === "tool" ? "Tool" : "Material"}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded",
        kind === "tool" ? "bg-muted text-muted-foreground" : "bg-material/15 text-material-foreground",
        className
      )}
    >
      <Icon className="size-3" />
    </span>
  )
}

/** "TOOLS · 3" / "MATERIALS · 2" — the heading over one kind's rows inside a request group. */
export function CargoSectionLabel({ kind, count }: { kind: CargoKind; count: number }) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 px-0.5 text-[10px] font-semibold tracking-wide uppercase",
        kind === "tool" ? "text-muted-foreground" : "text-material-foreground"
      )}
    >
      {kind === "tool" ? <WrenchIcon className="size-3" /> : <PackageIcon className="size-3" />}
      {kind === "tool" ? "Tools" : "Materials"}
      <span className="font-medium tabular-nums opacity-80">· {count}</span>
    </p>
  )
}
