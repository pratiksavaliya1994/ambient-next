"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { dispatchAction } from "@/app/(app)/dispatch/actions"
import { INITIAL_DISPATCH_STATE, type DispatchState } from "@/app/(app)/dispatch/action-state"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { toast } from "@/components/ui/toast"
import { DispatchRequestList } from "@/components/dispatch-request-row"
import { DispatchSendPanel } from "@/components/dispatch-send-panel"
import type { DispatchRequestSummary } from "@/lib/dispatch/summary"

/**
 * The Dispatch board: requests at `Assigned`, checked off and sent out under
 * one driver. The trips already under way live on their own screen,
 * `/dispatch/active` (`components/active-trips.tsx`) — this links there, and
 * that is also where a trip's stop order is set, since only there are requests
 * grouped into a route.
 *
 * This keeps the selection and the driver; the rows
 * (`components/dispatch-request-row.tsx`) and the send column
 * (`components/dispatch-send-panel.tsx`) are their own components.
 *
 * The write calls `update-request-status` (`dispatchAction` →
 * `dispatchRequests`), which moves `request.status` and every assigned tool to
 * `In Transit`.
 */
export function DispatchBoard({
  assignedRequests,
  activeTripCount,
  driverOptions,
  preselectedId,
}: {
  assignedRequests: DispatchRequestSummary[]
  /** Requests currently `In Transit`, across every driver — just the count, for the link to `/dispatch/active`. */
  activeTripCount: number
  /** `pms` and `user` display names, merged and sorted — a quick pick, not a roster. */
  driverOptions: string[]
  /** From the page's `?requestId=` — a request arriving here already checked, from its own `Dispatch` button. */
  preselectedId?: string
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        preselectedId &&
        assignedRequests.some((request) => request.id === preselectedId && request.notReady.length === 0)
          ? [preselectedId]
          : []
      )
  )
  const [driver, setDriver] = useState("")
  const [state, setState] = useState<DispatchState>(INITIAL_DISPATCH_STATE)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function dispatch() {
    startTransition(async () => {
      const result = await dispatchAction({ requestIds: [...selected], driver: driver.trim() })
      setState(result)

      if (result.status === "dispatched") {
        toast.add({
          title: result.warning ? "Dispatched with a warning" : "Dispatched",
          description:
            result.warning ??
            `${result.count} ${result.count === 1 ? "request" : "requests"} on the way with ${driver.trim()}.`,
        })
        router.push("/dispatch/active")
      }
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <Card data-size="sm">
        <CardHeader>
          <CardTitle className="text-base">Ready to dispatch</CardTitle>
          <CardDescription>Requests with tools assigned, waiting for a truck.</CardDescription>
        </CardHeader>
        <CardContent>
          {assignedRequests.length === 0 ? (
            <Empty className="border border-dashed py-8">
              <EmptyHeader>
                <EmptyTitle>Nothing waiting</EmptyTitle>
                <EmptyDescription>Assign tools to a request before it shows up here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DispatchRequestList requests={assignedRequests} selected={selected} onToggle={toggle} />
          )}
        </CardContent>
      </Card>

      <DispatchSendPanel
        driverOptions={driverOptions}
        driver={driver}
        onDriverChange={setDriver}
        selectedCount={selected.size}
        activeTripCount={activeTripCount}
        state={state}
        pending={pending}
        onDispatch={dispatch}
      />
    </div>
  )
}
