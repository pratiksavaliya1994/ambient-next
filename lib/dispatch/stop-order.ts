/**
 * A driver's stop sequence: the comparator every trip list sorts through, and
 * the codec the `set-request-order` workflow's `orders` parameter speaks.
 *
 * Deliberately **not** `server-only` — `components/driver-trip-card.tsx` sorts
 * with `compareStops` in the browser while `lib/bubble/request-order.ts`
 * encodes with `formatStopOrders` on the server, so this has to import cleanly
 * from both. Same reason `lib/bubble/reference-types.ts` exists.
 *
 * The sequence itself lives in `request.order`, offset above
 * `STOP_ORDER_BASE`; see `lib/bubble/enums.ts` for why it's offset and
 * `docs/bubble-set-request-order-spec.md` for the write.
 */

import { isSequenced, STOP_ORDER_BASE } from "@/lib/bubble/enums"

/**
 * Typed structurally rather than as a `DispatchRequestSummary` so this module
 * never has to import the `server-only` summary one.
 */
type SortableStop = { order: number; start: string | null; job: string; id: string }

/**
 * Sequenced stops first in their saved order, then everything never sequenced
 * by time.
 *
 * **The fallback is the whole design.** Every live row holds `100`, so until
 * somebody saves an order this degenerates entirely to the tie-break — which
 * is already a strict improvement on what `/dispatch/active` showed before
 * (`Created Date` *descending*, i.e. newest-dispatched first, meaningless as a
 * route). `(a.start ?? "")` matches what `app/(app)/dispatch/page.tsx` already
 * sorts by, so a dateless stop leads in both places.
 *
 * The final `id` comparison is not padding: two stops can genuinely share a
 * `start` and a `job` (the same job dispatched to the same driver twice), and
 * a non-total comparator would render differently on the server than on the
 * client.
 */
export function compareStops(a: SortableStop, b: SortableStop): number {
  const aSequenced = isSequenced(a.order)
  const bSequenced = isSequenced(b.order)
  if (aSequenced !== bSequenced) return aSequenced ? -1 : 1
  if (aSequenced && a.order !== b.order) return a.order - b.order
  return (a.start ?? "").localeCompare(b.start ?? "") || a.job.localeCompare(b.job) || a.id.localeCompare(b.id)
}

/** One request's new `order` value — already offset, ready for the wire. */
export type StopOrder = { requestId: string; order: number }

/**
 * `"{requestId}::{order}"`, the same encode-then-split shape
 * `lib/bubble/tool-status-updates.ts` uses for `toolStatusUpdates` and
 * `tools-summary.ts` uses for `Name: quantity`. The workflow splits on `::`.
 */
export function formatStopOrders(orders: readonly StopOrder[]): string[] {
  return orders.map((entry) => `${entry.requestId}::${entry.order}`)
}

/**
 * An ordered list of request ids becomes `101, 102, 103…`.
 *
 * The client sends only the array; the server derives the numbers — the same
 * "don't trust the client's copy" call `dispatchSchema` makes by carrying no
 * `toolIds`.
 */
export function toStopOrders(requestIds: readonly string[]): StopOrder[] {
  return requestIds.map((requestId, index) => ({ requestId, order: STOP_ORDER_BASE + index + 1 }))
}
