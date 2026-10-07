import { newYorkDayLabel } from "@/lib/bubble/dates"
import type { ToolRequest } from "@/lib/bubble/requests"
import { cn } from "@/lib/utils"

export function FactLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</span>
}

/**
 * A request is a delivery date, a pickup date, or (rarely) both — and either
 * way only the start date is shown, so the box's own label follows suit
 * rather than always reading the generic "Date" a two-sided request needs.
 */
function dateLabelFor(request: ToolRequest) {
  if (request.pickup && !request.delivery) return "Pickup date"
  if (request.delivery && !request.pickup) return "Drop date"
  return "Date"
}

/** The top of a `/requests` card's body: date and window, then GC, PM, floor and contact. */
export function RequestCardFacts({ request }: { request: ToolRequest }) {
  const facts = [
    request.gc && { label: "GC", value: request.gc },
    request.fieldPm && { label: "Field PM", value: request.fieldPm },
    request.floor && { label: "Floor", value: request.floor },
    request.contact && { label: "Contact", value: request.contact, sub: request.contactPhone },
  ].filter((fact): fact is { label: string; value: string; sub?: string | null } => Boolean(fact))

  return (
    <>
      {/* Date + window, side by side like a dispatch slip */}
      <div className="grid grid-cols-[auto_1fr] divide-x overflow-hidden rounded-lg border bg-background/70">
        <div className="flex min-w-28 flex-col gap-1 p-3">
          <FactLabel>{dateLabelFor(request)}</FactLabel>
          <span className="text-base leading-tight font-semibold wrap-anywhere">
            {newYorkDayLabel(request.start ?? request.end)}
          </span>
        </div>

        <div className="flex flex-col gap-1 p-3">
          <FactLabel>Window</FactLabel>
          <span className="text-sm leading-snug wrap-anywhere">{request.timeRange || "Not set"}</span>
        </div>
      </div>

      {/* Remaining facts as a tiled grid, hairline dividers between cells */}
      {facts.length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
          {facts.map((fact, index) => (
            <div
              key={fact.label}
              className={cn(
                "flex flex-col gap-0.5 bg-background/70 p-3",
                facts.length % 2 === 1 && index === facts.length - 1 && "col-span-2"
              )}
            >
              <FactLabel>{fact.label}</FactLabel>
              <span className="text-sm font-medium wrap-anywhere">{fact.value}</span>
              {fact.sub && <span className="text-xs wrap-anywhere text-muted-foreground">{fact.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
