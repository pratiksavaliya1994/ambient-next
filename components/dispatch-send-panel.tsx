"use client"

import Link from "next/link"
import { AlertCircleIcon, ArrowRightIcon, TruckIcon } from "lucide-react"

import type { DispatchState } from "@/app/(app)/dispatch/action-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

/**
 * The Dispatch board's right-hand column — pick a driver, send the checked
 * requests out, and the link through to the trips already on the road.
 *
 * Extracted out of `components/dispatch-board.tsx`, which had grown past both
 * the component and file size limits; the board keeps the selection state and
 * passes it down.
 */
export function DispatchSendPanel({
  driverOptions,
  driver,
  onDriverChange,
  selectedCount,
  activeTripCount,
  state,
  pending,
  onDispatch,
}: {
  /** `pms` and `user` display names, merged and sorted — a quick pick, not a roster. */
  driverOptions: string[]
  driver: string
  onDriverChange: (driver: string) => void
  selectedCount: number
  activeTripCount: number
  state: DispatchState
  pending: boolean
  onDispatch: () => void
}) {
  return (
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
                  onValueChange={(next) => next && onDriverChange(next)}
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
                  onChange={(event) => onDriverChange(event.target.value)}
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
              {selectedCount} {selectedCount === 1 ? "request" : "requests"} selected
              {driver.trim() && ` · ${driver.trim()}`}
            </span>
            <Button
              size="sm"
              className="w-full"
              disabled={pending || selectedCount === 0 || !driver.trim()}
              onClick={onDispatch}
            >
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
  )
}
