# Bubble Studio spec: `set-request-order`

A build sheet for the one workflow that writes `request.order` — a driver's
stop sequence on `/dispatch/active`. Written to be handed to whoever builds it
in Bubble Studio without the surrounding Next.js context.

**Status: not built.** `lib/bubble/request-order.ts#setRequestOrder` and
`#clearRequestOrder` call it today, so until this exists the "Save order"
button on a driver trip card fails with a visible error. Everything else on
that screen — the stop numbers, the drag interaction, the read-side ordering —
works without it, because the sequence is *read* through the ordinary Data API
and only the write needs a workflow.

> The `version-test` branch is the only version in use. Treat it as
> production: ~1,477 jobs, ~1,550 requests of real data. Test with rows you
> pick deliberately (§6) — every test run is a real write.

---

## 1. The workflow

**Backend Workflows → API Workflow**, named `set-request-order`, exposed as an
API endpoint with the same auth setting as `new-request` and
`update-request-status` ("User & admin").

## 2. Parameters

Exactly one.

| Parameter | Type | Notes |
| --- | --- | --- |
| `orders` | text **list** | Required. Each entry is `"{request unique id}::{order}"` — e.g. `"1724…x9::101"`. |

The `::` encode-then-split convention is the same one `new-pickup-request`'s
`toolStatusUpdates` parameter already uses (`lib/bubble/tool-status-updates.ts`).
The `order` half is a **3-digit integer as text**: `101` for stop 1, `102` for
stop 2, and so on — see §7 for why it starts at 101 rather than 1. The one
exception is `clearRequestOrder`, which sends a single entry ending `::100` to
put a delivered request back to the unsequenced default.

## 3. Why this is its own workflow and not a parameter on `update-request-status`

`update-request-status`'s tool write (its Step 3) is a single **synchronous**
*Make changes to a list of things* that puts **one** value on **every** item in
the list. That is exactly what lets it return an honest `tools` count that the
Next.js side compares against what it sent.

Ordering writes a **different** value to each item, so it cannot reuse that
step — it needs either a per-item filter expression or a fan-out. Bolting that
onto `update-request-status` would turn its one correct synchronous write into
two unrelated jobs, and five existing call sites depend on its current response
shape. A separate endpoint keeps both simple.

## 4. Steps

### Step 1 — the write

**Try the synchronous form first.** *Make changes to a list of things*:

- **List to change:**
  `Search for request (unique id is in orders:each item:split by "::":first item)`
- **Field to change:** `order` =
  `orders:filtered(This text contains This request's unique id):first item:split by "::":last item:converted to number`

One step, synchronous, exact — each row gets the number that was addressed to
it, and the operation is finished by the time Step 2 runs.

**If Studio refuses the nested `This request` reference inside the filter**
(the expression builder does not always offer it in this position), fall back
to a fan-out — *Schedule API Workflow on a list*, list = `orders`, calling a
private helper:

**`set-one-request-order`** (Backend Workflow, **not** exposed as an endpoint):

| Parameter | Type |
| --- | --- |
| `requestId` | text |
| `order` | number |

Its single step is *Make changes to a thing* — thing to change
`Search for request (unique id = requestId):first item`, field `order` =
`order`. No "Return data from API" step, matching `update-tool-status`.

The scheduling call passes
`requestId = This text:split by "::":first item` and
`order = This text:split by "::":last item:converted to number`.

> **Prefer the synchronous form, and record which one you built.** The fan-out
> is **asynchronous**: the `requests` count in Step 2 then reports what was
> *accepted*, not what was *written*, and Next.js's `revalidatePath` can re-read
> `/dispatch/active` before the writes land. Two things already absorb that —
> the trip card renders its own local copy of the route after a save rather
> than whatever the revalidated read returns, and the count check still catches
> a malformed or truncated payload — but a brief disagreement between Bubble's
> data tab and the screen is expected with the fallback and not with the
> synchronous step.

### Step 2 — Return data from API

```json
{ "ok": true, "requests": "orders:count" }
```

`lib/bubble/request-order.ts` Zod-parses `{ requests: number }` and throws
unless it equals the number of entries sent. A half-landed renumber leaves a
route with duplicate positions, which is worse than no renumber at all.

## 5. Call shape from Next.js

`POST /wf/set-request-order`

```json
{ "orders": ["1724000000000x111::101", "1724000000000x222::102", "1724000000000x333::103"] }
```

- **`setRequestOrder`** — sent by `setStopOrderAction`
  (`app/(app)/dispatch/active/actions.ts`) when a dispatcher saves a dragged
  route. The action re-reads the driver's live `In Transit` set first and
  refuses to write unless it matches the card exactly, so this workflow never
  sees a partial trip.
- **`clearRequestOrder`** — sent by `offloadAction`
  (`app/(app)/requests/[requestId]/actions.ts`) after a successful delivery, as
  a single `"{id}::100"` entry. Non-fatal there: the delivery is complete
  either way.

## 6. Test before relying on it

Pick the rows deliberately — these are real writes.

1. Choose one `In Transit` request and note its current `order` (it will be
   `100`). Run with `["<id>::103"]`. Read it back with
   `GET /obj/request/<id>` and confirm `order == 103` — **a number, not a
   string**. (The Next.js read path parses `order` with `z.number()`; a string
   would throw on every request read app-wide.)
2. Put it back: run with `["<id>::100"]`, confirm `100`.
3. Run a **3-entry** call across three requests and confirm all three changed,
   not just the first — this is what catches a filter expression that silently
   resolves to the same entry every time.
4. Send a malformed entry (`"<id>"`, no `::`) and see whether it fails loudly
   or silently skips, and whether `requests` still reports `orders:count`.
   Record the answer here.

## 7. Why positions start at 101, not 1

`lib/bubble/enums.ts` records that **the Bubble calendar sorts on `order`**,
and every one of the ~1,550 existing rows carries `100`. Writing plain `1, 2,
3` would sort every sequenced request ahead of every other row in that
calendar — a visible change to a UI this repo does not own.

Storing `100 + position` instead keeps a sequenced row exactly where it already
sits there, while still giving this app a total order to sort by. The Next.js
side calls the offset `STOP_ORDER_BASE`, tests membership with `isSequenced`
(`order > 100 && order <= 199`) and displays `stopPosition(order)` — so if it
is ever confirmed that nothing in Bubble actually sorts on `order`, switching
to plain `1..N` is a change to those two helpers and nothing else.
