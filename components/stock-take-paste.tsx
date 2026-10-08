"use client"

import { ClipboardPasteIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { matchPastedNames, type PasteMatch, type StockTakeTool } from "@/lib/tools/stock-take"

/**
 * A list of tool names — typed off labels, or pasted from a site lead's
 * message — ticked in one go. Exact names only (case and spacing ignored); a
 * line that names nothing, or names two tools, is shown and left for the list
 * below rather than guessed.
 */
export function StockTakePaste({
  tools,
  selected,
  onChange,
}: {
  tools: StockTakeTool[]
  selected: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
}) {
  const [text, setText] = React.useState("")
  const [match, setMatch] = React.useState<PasteMatch | null>(null)

  function tick() {
    const result = matchPastedNames(text, tools)
    setMatch(result)
    onChange(new Set([...selected, ...result.matched]))
    // Keep only the lines that still need a human, so a second paste starts clean.
    setText([...result.unmatched, ...result.ambiguous].join("\n"))
  }

  return (
    <Field>
      <FieldLabel htmlFor="stock-take-paste">Paste tool names (optional)</FieldLabel>
      <Textarea
        id="stock-take-paste"
        rows={3}
        placeholder={"S26 #7\n880 Vac #2\nPump Jack Electric #4"}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <FieldDescription>One per line. Matching tools get ticked in the list below.</FieldDescription>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={tick} disabled={text.trim() === ""}>
          <ClipboardPasteIcon />
          Tick these
        </Button>
      </div>
      {match && <PasteResult match={match} />}
    </Field>
  )
}

function PasteResult({ match }: { match: PasteMatch }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">
        {match.matched.length} {match.matched.length === 1 ? "tool" : "tools"} ticked.
      </p>
      {match.unmatched.length > 0 && (
        <FieldError>No tool is called: {match.unmatched.join(", ")}. Check the label and find it in the list.</FieldError>
      )}
      {match.ambiguous.length > 0 && (
        <FieldError>More than one tool is called: {match.ambiguous.join(", ")}. Tick the right one in the list.</FieldError>
      )}
    </div>
  )
}
