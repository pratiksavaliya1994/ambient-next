"use client"

import * as React from "react"

import { StockTakePaste } from "@/components/stock-take-paste"
import { StockTakeSaveBar } from "@/components/stock-take-save-bar"
import { StockTakeSelected } from "@/components/stock-take-selected"
import { StockTakeSetup } from "@/components/stock-take-setup"
import { StockTakeToolList } from "@/components/stock-take-tool-list"
import { toast } from "@/components/ui/toast"
import type { ToolCondition } from "@/lib/bubble/tool-enums"
import { summariseStockTake, type StockTakeState, type StockTakeTool } from "@/lib/tools/stock-take"
import { saveStockTakeAction } from "@/app/(app)/tools/stock-take/actions"

/**
 * One location's count: pick where you are, tick what's physically there, save.
 *
 * Nothing is pre-ticked. The records are mostly wrong right now, so a list
 * that arrives ticked invites confirming whatever it already says — "Tick the
 * N recorded here" is one deliberate click instead.
 *
 * After a save only the failures stay ticked, so Save again *is* the retry.
 */
export function StockTakeCount({ tools, locations }: { tools: StockTakeTool[]; locations: string[] }) {
  const [location, setLocation] = React.useState("")
  const [floor, setFloor] = React.useState("")
  const [condition, setCondition] = React.useState<ToolCondition | "">("")
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set())
  const [state, setState] = React.useState<StockTakeState>({ status: "idle" })
  const [pending, startTransition] = React.useTransition()

  function pickLocation(next: string) {
    setLocation(next)
    setSelected(new Set())
    setState({ status: "idle" })
  }

  function save() {
    startTransition(async () => {
      const result = await saveStockTakeAction({ location, toolIds: [...selected], floor, condition })
      setState(result)
      if (result.status !== "done") return

      const failed = result.outcomes.filter((outcome) => outcome.result === "failed")
      const saved = result.outcomes.filter((outcome) => outcome.result === "saved").length
      setSelected(new Set(failed.map((outcome) => outcome.toolId)))
      toast.add({
        title: `${saved} ${saved === 1 ? "tool" : "tools"} recorded at ${location}`,
        description: failed.length > 0 ? `${failed.length} failed — they're still ticked, save again to retry.` : undefined,
      })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <StockTakeSetup
        locations={locations}
        location={location}
        onLocationChange={pickLocation}
        floor={floor}
        onFloorChange={setFloor}
        condition={condition}
        onConditionChange={setCondition}
      />

      {location && (
        <>
          <StockTakePaste tools={tools} selected={selected} onChange={setSelected} />
          <StockTakeSelected tools={tools} location={location} selected={selected} onChange={setSelected} />
          <StockTakeToolList tools={tools} location={location} selected={selected} onChange={setSelected} />
          <StockTakeSaveBar
            summary={summariseStockTake(location, selected, tools)}
            state={state}
            pending={pending}
            onSave={save}
          />
        </>
      )}
    </div>
  )
}
