import "server-only"

import { z } from "zod"

import { bubbleRunWorkflow } from "@/lib/bubble/client"
import { DEFAULT_REQUEST_ORDER } from "@/lib/bubble/enums"
import { formatStopOrders, type StopOrder } from "@/lib/dispatch/stop-order"

/**
 * The one writer of `request.order` — a driver's stop sequence.
 *
 * Its own module rather than another function on `lib/bubble/requests.ts`,
 * which is already well over the file limit; `lib/bubble/` is organised as
 * small single-purpose modules (`tools-summary.ts`, `tool-status-updates.ts`,
 * `assigned-tools.ts`) and a new workflow gets a new one.
 *
 * Deliberately **not** folded into `update-request-status`: that workflow's
 * write is a single synchronous "make changes to a list of things" putting one
 * value on every item, which is exactly what lets it return an honest count.
 * Ordering puts a *different* value on each item and can't reuse that step.
 * See `docs/bubble-set-request-order-spec.md`.
 */
const SET_REQUEST_ORDER_WORKFLOW = "set-request-order"

/** `{ ok, requests }`. Only the count is acted on, mirroring `updateStatusResult` in `requests.ts`. */
const setOrderResult = z.looseObject({ requests: z.number() })

/**
 * Writes every stop's new position in one call. Throws when Bubble reports a
 * different count than was sent — a renumber that only half landed leaves a
 * route with duplicate positions, which is worse than none.
 */
export async function setRequestOrder(orders: readonly StopOrder[]): Promise<void> {
  if (orders.length === 0) return

  const raw = await bubbleRunWorkflow(SET_REQUEST_ORDER_WORKFLOW, { orders: formatStopOrders(orders) })
  const result = setOrderResult.parse(raw)

  if (result.requests !== orders.length) {
    throw new Error(`Bubble reordered ${result.requests} of ${orders.length} stops. Reload the screen and try again.`)
  }
}

/**
 * Puts one request back to the unsequenced constant. Called on offload, so a
 * delivered request can't carry a stale position into a trip it's dispatched
 * onto weeks later — under a different driver, with a number that meant
 * something on a route that no longer exists.
 */
export function clearRequestOrder(requestId: string): Promise<void> {
  return setRequestOrder([{ requestId, order: DEFAULT_REQUEST_ORDER }])
}
