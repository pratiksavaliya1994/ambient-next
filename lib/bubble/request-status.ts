import "server-only"

import { z } from "zod"

import { bubbleRunWorkflow } from "@/lib/bubble/client"
import type { RequestStatus } from "@/lib/bubble/enums"

/**
 * Writing `request.status` — and nothing else.
 *
 * Its own module rather than another function on `lib/bubble/requests.ts`,
 * which is already 700+ lines, and because this is now the *only* thing that
 * moves a request through its lifecycle. Trips own the tool writes; this owns
 * the request half, and the two are separate calls on purpose: a stop's drops
 * can span several requests, and each of those requests may land on a different
 * status.
 *
 * Reuses the existing `update-request-status` workflow in the one direction it
 * is proven safe — **real `requestIds`, no `toolIds`**. Step 3 there is gated
 * on `toolIds is not empty`, so omitting it is a supported no-op
 * (`dispatchRequests` relied on the same thing). The reverse — an empty
 * `requestIds` — is never done from anywhere; see `lib/bubble/trips.ts` for
 * why it is dangerous rather than merely useless.
 */

const UPDATE_REQUEST_STATUS = "update-request-status"

const result = z.looseObject({ requests: z.number() })

/**
 * Sets one status across N requests in one call.
 *
 * One value for the whole list is exactly the synchronous
 * *Make changes to a list of things* contract, so the returned count is honest
 * and a partial write is detectable rather than silent. A caller with requests
 * landing on different statuses groups them by status first and calls this once
 * per group — at most five calls, in practice one or two.
 *
 * `driver` is optional and stamped as a convenience. A request no longer has
 * *one* driver now that its tools can go out on several trips, but recording
 * whoever last moved something for it keeps the detail page's driver line
 * meaningful, and the workflow already guards the field with *only when not
 * empty*.
 */
export async function setRequestStatuses(
  requestIds: readonly string[],
  status: RequestStatus,
  driver?: string
): Promise<void> {
  if (requestIds.length === 0) return

  const raw = await bubbleRunWorkflow(UPDATE_REQUEST_STATUS, {
    requestIds: [...requestIds],
    status,
    ...(driver ? { driver } : {}),
  })
  const parsed = result.parse(raw)

  if (parsed.requests !== requestIds.length) {
    throw new Error(
      `Bubble moved ${parsed.requests} of ${requestIds.length} requests to ${status}. Reload and check what landed.`
    )
  }
}
