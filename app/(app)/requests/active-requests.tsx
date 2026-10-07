import { ActiveRequestBoard, type ActiveRequestItem } from "@/components/active-request-board"
import { NewRequestDialog } from "@/components/new-request-dialog"
import { RequestCard } from "@/components/request-card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { newYorkDayValue } from "@/lib/bubble/dates"
import { listActiveRequests } from "@/lib/bubble/request-lists"
import { hasContent, type ToolRequest } from "@/lib/bubble/requests"

import { loadPoolState } from "./request-pool"

function haystackOf(request: ToolRequest) {
  return [request.job, request.fieldPm, request.contact, request.floor].filter(Boolean).join(" ").toLowerCase()
}

/**
 * The Active tab: every request whose lifecycle isn't over (see
 * `listActiveRequests` for what that means on live data), fetched whole and
 * handed to the browser to filter. Cards render here, on the server, and
 * travel as ready-made nodes, so the client half only decides which to show.
 */
export async function ActiveRequests() {
  const [found, poolStateOf] = await Promise.all([listActiveRequests(), loadPoolState()])

  const items: ActiveRequestItem[] = found.filter(hasContent).map((request) => {
    const date = request.start ?? request.end
    return {
      id: request.id,
      card: <RequestCard request={request} pool={poolStateOf(request.id)} />,
      haystack: haystackOf(request),
      status: request.status,
      delivery: request.delivery,
      pickup: request.pickup,
      day: date ? newYorkDayValue(date) : null,
    }
  })

  if (items.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No active requests</EmptyTitle>
          <EmptyDescription>
            Every request&apos;s lifecycle is complete. Create a request and it will appear here until its tools are
            delivered or returned.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <NewRequestDialog />
        </EmptyContent>
      </Empty>
    )
  }

  return <ActiveRequestBoard items={items} />
}
