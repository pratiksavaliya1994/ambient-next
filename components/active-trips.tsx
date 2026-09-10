import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemTitle } from "@/components/ui/item"
import type { DispatchRequestSummary } from "@/lib/dispatch/summary"
import { cn } from "@/lib/utils"

function driverInitials(driverName: string) {
  const words = driverName.trim().split(/\s+/)
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase()
}

/**
 * `/dispatch/active` — every request at `In Transit`, grouped by driver.
 *
 * Split out from the Dispatch board itself (`components/dispatch-board.tsx`)
 * so the picker and the road view are two screens rather than one crowded
 * one; the board still links here, and this links back.
 */
export function ActiveTrips({ tripsByDriver }: { tripsByDriver: [string, DispatchRequestSummary[]][] }) {
  if (tripsByDriver.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No trips in progress</EmptyTitle>
          <EmptyDescription>Nothing is In Transit right now.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tripsByDriver.map(([driverName, requests]) => (
        <Card key={driverName} size="sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>{driverInitials(driverName)}</AvatarFallback>
              </Avatar>
              <CardTitle>{driverName}</CardTitle>
            </div>
            <CardAction>
              <Badge variant="outline" className="tabular-nums">
                {requests.length} {requests.length === 1 ? "stop" : "stops"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col">
              {requests.map((request, index) => {
                const isLast = index === requests.length - 1
                return (
                  <div key={request.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-2.5 size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                      {!isLast && <span className="w-px flex-1 bg-muted-foreground/25" />}
                    </div>
                    <div className={cn("min-w-0 flex-1", !isLast && "pb-2")}>
                      <Item variant="outline" size="sm" render={<Link href={`/requests/${request.id}`} />}>
                        <ItemContent>
                          <ItemTitle className="flex items-center justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate">{request.job}</span>
                            <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                              {request.toolCount} {request.toolCount === 1 ? "tool" : "tools"}
                            </span>
                          </ItemTitle>
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
                          <div className="flex items-center justify-end gap-0.5 text-xs font-medium text-primary">
                            Complete delivery
                            <ChevronRightIcon className="size-3.5" />
                          </div>
                        </ItemContent>
                      </Item>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
