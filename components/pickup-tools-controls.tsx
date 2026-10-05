"use client"

import { selectionOfTools, type PickupSelection } from "@/components/pickup-tool-picker"
import { Button } from "@/components/ui/button"
import { CardAction } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import type { PickupTool } from "@/lib/bubble/pickup-tools"
import type { Job } from "@/lib/bubble/reference-types"

/**
 * The two controls every pickup tool list carries — on the pickup form and the
 * combined page's pickup card alike — shared so the two can't drift.
 */

/** "Clear all" / "Select all" in the tools card's header. */
export function PickupToolsActions({
  tools,
  selected,
  onChange,
}: {
  tools: PickupTool[]
  selected: Map<string, PickupSelection>
  onChange: (next: Map<string, PickupSelection>) => void
}) {
  return (
    <CardAction className="flex items-center gap-1">
      {selected.size > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(new Map())}>
          Clear all
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={tools.length === 0 || selected.size === tools.length}
        onClick={() => onChange(selectionOfTools(tools))}
      >
        Select all
      </Button>
    </CardAction>
  )
}

/**
 * "Cleanup the Site" — selects (but doesn't lock) every tool on file at the
 * job. Its form value has no Bubble field of its own; it's folded into `notes`
 * on write.
 */
export function CleanupSiteSwitch({
  checked,
  onCheckedChange,
  job,
  tools,
  onSelect,
  onLoadTools,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  job: Job | null
  tools: PickupTool[]
  onSelect: (next: Map<string, PickupSelection>) => void
  onLoadTools: (target: Job) => Promise<PickupTool[]>
}) {
  return (
    <Field orientation="horizontal">
      <Switch
        id="cleanup"
        checked={checked}
        disabled={!job}
        onCheckedChange={(next) => {
          const on = next === true
          onCheckedChange(on)
          if (!on || !job) return
          // The job-select fetch usually landed already — select what is on
          // screen rather than reloading the same list. If it hasn't (toggled
          // mid-flight, or it came back empty), fetch first so the toggle
          // can't select nothing.
          if (tools.length > 0) return onSelect(selectionOfTools(tools))
          void onLoadTools(job).then((fetched) => onSelect(selectionOfTools(fetched)))
        }}
      />
      <FieldLabel htmlFor="cleanup">Cleanup the Site — take everything on file</FieldLabel>
    </Field>
  )
}
