"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircleIcon, ArrowRightIcon, MapPinIcon, TriangleAlertIcon, TruckIcon, WrenchIcon } from "lucide-react"

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
import { TripToolList } from "@/components/trip-tool-list"
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
/**
 * The blue rows above already say which tools; this says what the driver is
 * signing up for by taking this request — extra stops, before the delivery.
 */
function pickupSummary(stops: DispatchRequestSummary["pickupStops"]): string {
  const tools = stops.reduce((sum, stop) => sum + stop.toolIds.length, 0)
  return `Pick up ${tools} ${tools === 1 ? "tool" : "tools"} from ${stops.length} other job ${
    stops.length === 1 ? "site" : "sites"
  } before delivering`
}

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
            <ItemGroup className="gap-2">
              {assignedRequests.map((request) => {
                const checked = selected.has(request.id)
                const blocked = request.notReady.length > 0
                return (
                  <Item
                    key={request.id}
                    size="sm"
                    variant="outline"
                    className={cn(
                      "items-start bg-background shadow-sm transition-colors sm:flex-nowrap sm:items-center",
                      blocked ? "opacity-70" : "cursor-pointer hover:bg-muted/40",
                      checked && "border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/5"
                    )}
                  >
                    <Checkbox
                      className="mt-0.5 shrink-0 sm:mt-0"
                      checked={checked}
                      disabled={blocked}
                      onCheckedChange={(next) => toggle(request.id, next === true)}
                      aria-label={`Select ${request.job}`}
                    />
                    <ItemContent className="min-w-0" onClick={() => !blocked && toggle(request.id, !checked)}>
                      <ItemTitle
                        className="line-clamp-2 w-full wrap-anywhere sm:line-clamp-1 sm:truncate"
                        title={request.job}
                      >
                        {request.job}
                      </ItemTitle>
                      <ItemDescription className="sm:truncate">
                        {newYorkDayLabel(request.start ?? request.end)}
                        {request.timeRange && ` · ${request.timeRange}`}
                        {request.fieldPm && ` · ${request.fieldPm}`}
                      </ItemDescription>
                      <TripToolList requestId={request.id} tools={request.tools} />
                      {request.missing.length > 0 && (
                        <div className="flex items-start gap-1.5 rounded-md bg-status-attention/15 px-2 py-1.5 text-xs text-status-attention-foreground">
                          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                          <span className="min-w-0 wrap-anywhere">
                            <span className="font-medium">Not fully assigned</span> — missing{" "}
                            {request.missing.map((line) => `${line.toolType} ×${line.short}`).join(", ")}
                          </span>
                        </div>
                      )}
                      {request.pickupStops.length > 0 && (
                        <span className="flex items-start gap-1.5 text-xs font-medium text-status-active-foreground">
                          <MapPinIcon className="mt-px size-3.5 shrink-0" />
                          <span className="min-w-0 wrap-anywhere">{pickupSummary(request.pickupStops)}</span>
                        </span>
                      )}
                      {/* The rows above already name the offending tools in red —
                          this says what that costs: the checkbox is disabled. */}
                      {blocked && (
                        <div className="flex items-start gap-1.5 rounded-md bg-destructive/15 px-2 py-1.5 text-xs text-destructive">
                          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                          <span className="min-w-0 wrap-anywhere">
                            <span className="font-medium">Not available to dispatch</span> — {request.notReady.length}{" "}
                            {request.notReady.length === 1 ? "tool is" : "tools are"} on another request
                          </span>
                        </div>
                      )}
                    </ItemContent>
                    {/* Below `sm` this wraps onto its own full-width line — `basis-full`, the
                        same trick `ItemFooter` uses — so the job name keeps the first line to
                        itself instead of being squeezed by three controls. */}
                    <ItemActions
                      className="basis-full justify-between border-t pt-2 sm:shrink-0 sm:basis-auto sm:justify-end sm:border-t-0 sm:pt-0"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Badge variant="outline" className="tabular-nums">
                        {request.toolCount} {request.toolCount === 1 ? "tool" : "tools"}
                      </Badge>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/requests/${request.id}/assign`}
                          className="flex items-center gap-1 py-1.5 text-xs text-muted-foreground hover:underline sm:py-0"
                        >
                          <WrenchIcon className="size-3" />
                          Edit assignment
                        </Link>
                        <Link
                          href={`/requests/${request.id}`}
                          className="py-1.5 text-xs text-muted-foreground hover:underline sm:py-0"
                        >
                          View
                        </Link>
                      </div>
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
