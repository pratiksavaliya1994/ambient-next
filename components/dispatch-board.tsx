"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircleIcon, ArrowRightIcon, TruckIcon } from "lucide-react"

import { dispatchAction } from "@/app/(app)/dispatch/actions"
import { INITIAL_DISPATCH_STATE, type DispatchState } from "@/app/(app)/dispatch/action-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import type { DispatchRequestSummary } from "@/lib/dispatch/summary"
import { cn } from "@/lib/utils"

/**
 * The Dispatch board: requests at `Assigned`, checked off and sent out under
 * one driver. The trips already under way live on their own screen,
 * `/dispatch/active` (`components/active-trips.tsx`) — this links there.
 *
 * The write calls `update-request-status` (`dispatchAction` →
 * `dispatchRequests`), which moves `request.status` and every assigned tool to
 * `In Transit`. That Bubble workflow isn't built yet
 * (`docs/bubble-request-status-workflow.md` §6), so a real Dispatch attempt
 * fails with a visible error until it exists — the wiring is complete either
 * way.
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
    () => new Set(preselectedId && assignedRequests.some((request) => request.id === preselectedId) ? [preselectedId] : [])
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
            <ItemGroup className="gap-2">
              {assignedRequests.map((request) => {
                const checked = selected.has(request.id)
                return (
                  <Item
                    key={request.id}
                    size="sm"
                    variant="outline"
                    className={cn(
                      "cursor-pointer flex-nowrap bg-background shadow-sm transition-colors hover:bg-muted/40",
                      checked && "border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/5"
                    )}
                  >
                    <Checkbox
                      className="shrink-0"
                      checked={checked}
                      onCheckedChange={(next) => toggle(request.id, next === true)}
                      aria-label={`Select ${request.job}`}
                    />
                    <ItemContent className="min-w-0" onClick={() => toggle(request.id, !checked)}>
                      <ItemTitle className="w-full truncate" title={request.job}>
                        {request.job}
                      </ItemTitle>
                      <ItemDescription className="truncate">
                        {newYorkDayLabel(request.start ?? request.end)}
                        {request.timeRange && ` · ${request.timeRange}`}
                        {request.fieldPm && ` · ${request.fieldPm}`}
                      </ItemDescription>
                      {request.tools.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {request.tools.map((tool) => (
                            <Badge key={tool.name} variant="secondary" className="font-normal">
                              {tool.name}
                              {tool.count > 1 && ` ×${tool.count}`}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </ItemContent>
                    <ItemActions className="shrink-0" onClick={(event) => event.stopPropagation()}>
                      <Badge variant="outline" className="tabular-nums">
                        {request.toolCount} {request.toolCount === 1 ? "tool" : "tools"}
                      </Badge>
                      <Link href={`/requests/${request.id}`} className="text-xs text-muted-foreground hover:underline">
                        View
                      </Link>
                    </ItemActions>
                  </Item>
                )
              })}
            </ItemGroup>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card data-size="sm">
          <CardHeader>
            <CardTitle className="text-base">Send it out</CardTitle>
            <CardDescription>Pick a driver for the selected requests.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="dispatch-driver">Driver</FieldLabel>
                <div className="flex flex-col gap-2">
                  <Select
                    items={driverOptions.map((name) => ({ label: name, value: name }))}
                    value={driverOptions.includes(driver) ? driver : null}
                    onValueChange={(next) => next && setDriver(next)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a PM or user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {driverOptions.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Input
                    id="dispatch-driver"
                    value={driver}
                    onChange={(event) => setDriver(event.target.value)}
                    placeholder="Or type a driver's name"
                    className="w-full"
                  />
                </div>
              </Field>
            </FieldGroup>

            {(state.status === "error" || state.status === "invalid") && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Could not dispatch</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-3">
              <span className="text-sm text-muted-foreground tabular-nums">
                {selected.size} {selected.size === 1 ? "request" : "requests"} selected
                {driver.trim() && ` · ${driver.trim()}`}
              </span>
              <Button size="sm" className="w-full" disabled={pending || selected.size === 0 || !driver.trim()} onClick={dispatch}>
                {pending ? <Spinner /> : <TruckIcon />}
                Dispatch
              </Button>
            </div>
          </CardContent>
        </Card>

        <Link
          href="/dispatch/active"
          className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50"
        >
          <span>
            <span className="font-medium">Active trips</span>
            <span className="text-muted-foreground"> — see what&rsquo;s already on the road</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
            <Badge variant="outline" className="tabular-nums">
              {activeTripCount} {activeTripCount === 1 ? "trip" : "trips"}
            </Badge>
            <ArrowRightIcon className="size-4" />
          </span>
        </Link>
      </div>
    </div>
  )
}
