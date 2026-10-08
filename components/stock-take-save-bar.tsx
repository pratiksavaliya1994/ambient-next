"use client"

import { SaveIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type { StockTakeState, StockTakeSummary } from "@/lib/tools/stock-take"

/** What Save is about to do, the button, and what the last save did. */
export function StockTakeSaveBar({
  summary,
  state,
  pending,
  onSave,
}: {
  summary: StockTakeSummary
  state: StockTakeState
  pending: boolean
  onSave: () => void
}) {
  const total = summary.moving + summary.confirming

  return (
    <div className="sticky bottom-0 flex flex-col gap-3 rounded-lg border bg-background p-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li>
          <span className="font-medium">{summary.moving}</span> moving here
        </li>
        <li>
          <span className="font-medium">{summary.confirming}</span> already recorded here
        </li>
        {summary.notTicked > 0 && (
          <li className="text-muted-foreground">
            {summary.notTicked} recorded here but not ticked — left as they are
          </li>
        )}
      </ul>

      <div>
        <Button onClick={onSave} disabled={pending || total === 0}>
          {pending ? <Spinner /> : <SaveIcon />}
          {pending ? `Saving ${total} tools…` : `Save ${total} ${total === 1 ? "tool" : "tools"}`}
        </Button>
      </div>

      <StockTakeOutcomes state={state} />
    </div>
  )
}

/**
 * The tools a save did *not* fully land — held ones to go and release, failed
 * ones to retry. Successes are only counted; listing 200 of them helps nobody.
 */
function StockTakeOutcomes({ state }: { state: StockTakeState }) {
  if (state.status === "idle") return null
  if (state.status === "error") return <FieldError>{state.message}</FieldError>

  const problems = state.outcomes.filter((outcome) => outcome.result !== "saved")
  const saved = state.outcomes.length - problems.length

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">
        Last save: {saved} saved
        {problems.length > 0 && `, ${problems.length} not saved`}.
      </p>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-1">
          {problems.map((outcome) => (
            <li key={outcome.toolId} className={outcome.result === "failed" ? "text-destructive" : undefined}>
              <Link href={`/tools/${outcome.toolId}`} className="font-medium underline-offset-4 hover:underline">
                {outcome.name}
              </Link>{" "}
              — {outcome.result === "held" ? "skipped" : "failed"}: {outcome.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
