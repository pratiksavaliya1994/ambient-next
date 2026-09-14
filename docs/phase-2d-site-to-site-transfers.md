# Phase 2D — site-to-site tool transfers

**Built, frontend only — no Bubble change of any kind.** Read
[`phase-2-lifecycle.md`](./phase-2-lifecycle.md) and
[`phase-2bc-dispatch-offload.md`](./phase-2bc-dispatch-offload.md) first; this
slice sits on top of both and supersedes their "**Site-to-site redeployment
isn't supported**" limit.

## The case

A tool is physically sitting on job site A, idle, and is wanted on job site B
— without routing back through the warehouse first. The PM assigns it to B's
request as normal. The driver who dispatches B then has to swing by A to
collect it **before** dropping at B, and one request can carry several such
tools across several different sites.

Confirmed with the user: this is **informational** — the itinerary is shown,
not tracked stop-by-stop — and ordering only has to guarantee _a request's own
pickups happen before its own delivery_. No cross-request route optimisation.

## Why no schema or workflow change was needed

Three facts, each verified rather than assumed:

- **`isReadyForDispatch` only ever keyed on `statusNew`, never on `location`.**
  A tool sitting on a job site with `statusNew: "Available"` already passed the
  dispatch gate before this slice existed. "Dispatch is blocked unless the tool
  is at the warehouse" was only ever true _in practice_, because nothing wrote
  `Available` anywhere else.
- **`update-request-status` Step 3 only edits tools whose `_id` is in the
  `toolIds` array it's given** (`bubble-update-request-status-spec.md`). A tool
  left out of that array is not touched at all — not skipped, not defaulted.
  **Omitting an id is therefore a supported way to defer a tool**, and it is
  the whole mechanism this slice runs on.
- **Offload was already origin-agnostic** — it writes every tool to the job's
  name regardless of where the tool started.

So the only real gap was display plus one deferred write. No new Bubble field,
table, option-set value or workflow.

## The one new idea: a per-tool trip state

`deriveTripStatus` (`lib/dispatch/summary.ts`) classifies each of a request's
assigned tools into exactly one state, from **live `statusNew` / `location`
only**. There is deliberately no historical lookback — an earlier draft read
`toolshistory` to reconstruct a tool's origin and was rejected as fragile.

`classifyTool` tests in this order:

| State            | Rule                                                                                                            | Means                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `left-behind`    | request is `Delivered` **or** `In Transit`, **and** `tool.statusNew === "Pickup Requested"` **and** `!isWarehouseLocation(tool.location)` | reached, but couldn't be taken — this trip went without it |
| `carried`        | request is `In Transit` **and** `tool.statusNew === "In Transit"` **and** `tool.location === request.driver`       | already in the vehicle on this trip                       |
| `not-ready`      | `!isReadyForDispatch(tool.statusNew)`                                                                             | mid-flow on some **other** request — blocks dispatch      |
| `pending-pickup` | `!isWarehouseLocation(tool.location)`                                                                             | ready, but sitting on another job site                    |
| `null`           | neither                                                                                                           | ready, at/near the warehouse — the ordinary case          |

`left-behind` is tested **before** `not-ready` — `Pickup Requested` fails
`isReadyForDispatch` too, so `not-ready` would otherwise swallow it — and is
gated on the request being `In Transit`/`Delivered`. That gate is load-bearing:
at `Assigned` the same two fields mean "some *pickup request* already wants this
tool," a genuine blocker the Dispatch board must keep reporting as `not-ready`,
not a decision this trip made. A `Delivered` request classifies too, and
collapses every other state to `null`, so the flag survives completing the
delivery — otherwise "keep it on the request, flagged" would only hold until the
driver finished.

`isWarehouseLocation` (`lib/bubble/enums.ts`) is new: `"Warehouse"`,
`"1407 Locker"`, `"Other - Not a Job Site"`, plus blank/`NO_LOCATION` kept
lenient — the same "not enough signal to say otherwise" treatment
`isAssignable`/`isReadyForDispatch` already give an unset value, so a blank
location never spuriously produces a pickup stop. It exports
`WAREHOUSE_LOCATIONS` alongside — the same constant
[`phase-3d-warehouse-offload.md`](./phase-3d-warehouse-offload.md) anticipated
as `WAREHOUSE_JOB_NAMES`. **Reuse it there rather than defining a second list.**

One pass produces four shapes, for the four render layouts that need them:

- `tools` — flat, one entry per physical unit, sorted `pending-pickup` →
  `not-ready` → plain → `carried`, so outstanding work is always at the top.
- `notReady` and `pickupStops` — the roll-ups the dispatch gate's message and
  the delivery guard's count read from.
- `byToolId` — for the request detail page, which groups by requested type
  rather than listing flat.

## The write path

### Dispatch splits the load

`dispatchAction` still refuses outright if any tool is `not-ready`. Otherwise
it now passes **only warehouse-origin tool ids** to `dispatchRequests`:

```ts
const readyToolIds = tools.filter((tool) => isWarehouseLocation(tool.location)).map((tool) => tool.id)
;({ toolsUpdated } = await dispatchRequests(requestIds, driver, readyToolIds))
```

The request moves to `In Transit` and warehouse tools move with the driver, as
always. Off-site tools are simply not in the array, so Bubble leaves them
`Available` at their own site — which is the truth until someone physically
collects them. The partial-write warning compares against `readyToolIds.length`
accordingly.

### The driver confirms the pickup

`confirmPickupAction` (`app/(app)/dispatch/active/actions.ts`) is what actually
moves an off-site tool. It re-checks that the request is `In Transit` with a
driver and that each tool is still ready, then calls **the same
`dispatchRequests`** — no second write path, no new workflow:

```ts
await dispatchRequests([requestId], request.driver, toolIds)
```

Scoping `toolIds` to just the tools being collected is what makes the write
land on only those; re-setting an already-`In Transit` request to `In Transit`
is a harmless no-op.

### …or says it couldn't

A driver who reaches the stop and **can't** take the tool — still in use,
buried, gone — had no way to say so, and one such tool stranded the whole
request: the gate below refuses the delivery while any assigned tool is still
sitting off-site, so the tools already on the truck couldn't be dropped either.

`leaveBehindAction` (same file) is the other answer. It guards harder than the
confirm beside it — the tool must actually be on this request, and must still be
waiting at its own site — then calls `leaveToolsBehind`
(`lib/bubble/requests.ts`), which sends **`toolStatus` and nothing else**:

```ts
{ requestIds: [requestId], status: "In Transit", toolIds, toolStatus: "Pickup Requested" }
```

Step 3 guards `toolLocation` and `toolUser` with *only when not empty*, so
omitting them leaves the tool's `location` at its own job site and its
`currentUser` alone. That is the entire mechanism: `statusNew` changes, the tool
doesn't move, and it drops out of `pickupStops` because `pending-pickup`
requires `isReadyForDispatch` (`Available` or `Assigned`), which `Pickup
Requested` fails. It stays **assignable** to a *different* request, though —
see `isFreeToAssign` in `lib/bubble/enums.ts`, added alongside the
assign-time `Available`/`Assigned` gate (`docs/phase-2-lifecycle.md`'s
Availability section): it accepts `Pickup Requested` specifically so this
tool isn't silently locked out of the picker by that later change.

This is the same call [`phase-3c-actual-pickup.md`](./phase-3c-actual-pickup.md)
specifies for its left-behind set, arriving one slice early. No Bubble change of
any kind, again.

**Final, behind a confirmation dialog.** There is no undo action, matching the
pickup confirm; `LeaveBehindButton` asks first for exactly that reason.

### Offload refuses to lie

`offloadAction` re-derives `pickupStops` immediately before its write and
rejects if any remain — a tool still sitting off-site has never reached the
driver, so it cannot truthfully be marked `Delivered` at the job. The UI half
(`CompleteDeliveryAction`) disables the button and says how many tools are
outstanding rather than letting the confirm dialog open at all; the server
check is the authoritative one, since server actions are reachable by direct
POST.

It then **subtracts `leftBehind` from what it writes.** Offload used to send
every `assignedtools` id; a tool the driver couldn't collect would have been
recorded `Delivered` at a job it never reached, which is the same lie in a
quieter form. A request whose tools were *all* left behind is refused outright —
there's no drop to record — while a request with no assigned tools at all
(materials only) still completes, as before.

## What renders where

`AssignedToolRow` is the single shared row, so a tool looks the same on every
screen. Colour and a filled pill carry **what to do** (`Pick up`,
`On the truck`, `Unavailable`); a neutral outline pill carries **what Bubble
holds** in `statusNew`. Keeping those apart is what stops three tools that all
read `Available` from looking identical when two of them have to be collected
from a job site first. A 4px left border repeats the verdict down a list.

| Screen                  | Component                            | Layout                                                    |
| ----------------------- | ------------------------------------ | --------------------------------------------------------- |
| `/requests/[requestId]` | `RequestToolSlots` → `AssignedToolRow` | grouped under each requested type, full size              |
| `/dispatch`             | `TripToolList` → `AssignedToolRow`     | flat and `compact` — plain tools collapse to one line     |
| `/dispatch/active`      | `TripToolList` → `AssignedToolRow`     | same, plus the pickup action                              |

Two separate conditions, easy to conflate:

| Request status | Coloured rows        | "Picked up" / "Not picked up" buttons |
| -------------- | -------------------- | ------------------------------------- |
| `New`          | —                    | —                                     |
| `Assigned`     | yes                  | —                                     |
| `In Transit`   | yes                  | yes                                   |
| `Delivered`    | `left-behind` only   | —                                     |

Rows are coloured from `Assigned` onward so a PM can **review the extra stops
before committing to dispatch**. The buttons are `In Transit` only, because both
answers write to a tool on this trip — meaningless before the trip exists, and
both actions would reject it anyway. `Delivered` colours nothing except the
tools that never made it; see the state table above.

Both buttons call `preventDefault`/`stopPropagation`: the Active trips card
wraps each request in a `Link`, and without it a pickup — or opening the
leave-behind dialog — would also navigate away from the screen it happened on.

## Files

| File                                            | What                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `lib/bubble/enums.ts`                           | `WAREHOUSE_LOCATIONS`, `isWarehouseLocation`, `TOOL_STATUS_PICKUP_REQUESTED`                               |
| `lib/bubble/requests.ts`                        | `leaveToolsBehind` — `toolStatus` only, no `toolLocation`/`toolUser`                                       |
| `lib/dispatch/summary.ts`                       | `ToolTripState`, `TripTool`, `classifyTool`, `deriveTripStatus` (incl. `leftBehind`); `DispatchRequestSummary.tools` is now `TripTool[]` |
| `lib/schemas/assignment.ts`                     | `confirmPickupSchema`, `leaveBehindSchema`                                                                 |
| `app/(app)/dispatch/actions.ts`                 | splits `toolIds` into warehouse-now / off-site-later                                                       |
| `app/(app)/dispatch/active/actions.ts`          | `confirmPickupAction`, `leaveBehindAction`                                                                 |
| `app/(app)/dispatch/active/action-state.ts`     | `PickupState` (new)                                                                                        |
| `app/(app)/requests/[requestId]/actions.ts`     | `offloadAction`'s outstanding-pickup guard, and subtracting `leftBehind` from the write                    |
| `app/(app)/requests/[requestId]/page.tsx`       | computes trip state for every status but `New`                                                             |
| `components/assigned-tool-row.tsx`              | the shared row (new)                                                                                       |
| `components/pickup-tool-button.tsx`             | one tool's confirm (new)                                                                                   |
| `components/leave-behind-button.tsx`            | one tool's "couldn't take it", behind a confirm dialog (new)                                               |
| `components/request-tool-slots.tsx`             | detail page's slot list, extracted (new)                                                                   |
| `components/trip-tool-list.tsx`                 | compact list for both dispatch screens (new)                                                               |
| `components/complete-delivery-action.tsx`       | `pendingPickupCount` guard, `leftBehindCount` copy and the nothing-collected case                          |
| `components/dispatch-board.tsx`, `components/active-trips.tsx` | badge rows replaced by `TripToolList`                                                       |

**Written and then deleted during this slice** — none reached a commit, so
grepping git history for them finds nothing. Listed because each is a wrong
turn worth not retaking:

- `lib/bubble/tools-history.ts` — read `toolshistory` to reconstruct where a
  tool had come from. Rejected: fragile, and unnecessary once dispatch simply
  leaves off-site tools alone.
- `components/trip-pickup-status.tsx`, `components/pickup-stop-list.tsx` —
  pickups as their own section beside the tool list. Rejected: it duplicated
  every tool. The state belongs *on* the tool row.

## Verification

Compile-time only so far — `npm run typecheck` and `npm run build` pass. The
live path has **not** been exercised against Bubble.

To test it, the setup has to be made in Bubble Studio's Data tab directly,
because this app still has no writer for "mark a tool Available on a job site":

1. Pick a live `tools` row. Set `statusNew` to `Available` while leaving
   `location` as a real `jobs.name`, not a warehouse one.
2. Assign it to a request for a **different** job, alongside a normal warehouse
   tool.
3. `/requests/[id]` at `Assigned` — the off-site tool shows a blue **Pick up**
   row, the warehouse one a quiet single line. No button yet.
4. `/dispatch` — the request is selectable, shows the same two rows plus
   "Pick up 1 tool from 1 other job site before delivering".
5. Dispatch it. In Bubble, confirm the warehouse tool moved to `In Transit` at
   the driver's name and **the off-site tool is untouched** — still
   `Available`, still at its own job.
6. `/dispatch/active` and `/requests/[id]` both now offer **Picked up** and
   **Not picked up** on the off-site tool. **Complete delivery** is disabled,
   captioned "1 tool still to pick up".
7. Click **Picked up**. That tool moves to `In Transit` at the driver's name,
   its row turns green **On the truck**, and Complete delivery enables.
8. Complete the delivery and confirm both tools land at the job's name.
9. Reset the tool's `statusNew`/`location` afterwards — this is the live
   database.

Then the same setup again for the other answer:

10. At step 7, click **Not picked up** and confirm the dialog instead. The row
    turns amber **Not picked up**, reading "Left at {job} — not collected on
    this trip", and Complete delivery enables.
11. In Bubble, confirm that tool reads `statusNew = "Pickup Requested"` with its
    **`location` still the job's name**, `currentUser` untouched and `condition`
    unchanged.
12. Complete the delivery. The warehouse tool lands `Delivered` at the request's
    job; **the left-behind tool must not have moved**. Its row still shows the
    **Not picked up** flag on the now-`Delivered` request.
13. Guards: a direct re-POST of `leaveBehindAction` against the delivered
    request must refuse; so must one naming a tool assigned to a different
    request. A request whose *every* tool was left behind must refuse to
    complete at all.

Repeat with two tools at two different sites to confirm both stops render and
group separately.

## Known limits and what's deliberately deferred

- **No UI writes "Available at a job site."** That's the trigger for this whole
  flow and it still only happens in Bubble, the old UI, or a future
  tools-management screen the client explicitly deferred. Until then the slice
  is dormant in normal use.
- **Stop order is alphabetical by location**, and nothing yet lets a driver
  resequence pickups and drops. The shapes are built to absorb that later:
  `pickupStops` is an ordered array, each entry carries its own `toolIds`, and
  every confirm is an independent, idempotent per-tool write — so a future
  sequence field would change display order only, never the write path.
  Correctness does not depend on the order confirms arrive in.
- **Neither answer can be undone from the app.** Confirming moves the tool to
  the driver; leaving it behind flags it `Pickup Requested`. Reverting either is
  a Bubble edit, the same as every other mistake after dispatch. Agreed with the
  user rather than deferred — the leave-behind button asks for confirmation
  instead of offering an undo.
- **`left-behind` is read off the tool, not the assignment.** `assignedtools`
  has no field to hold "not collected on this request" and none is being added,
  so the marker is the tool's own `Pickup Requested` + off-site `location`. A
  tool flagged by the PM-facing Pickup flow (`update-tool-status`) while also
  assigned to an `In Transit` delivery therefore reads as left behind. It
  already classified as `not-ready` before this slice, and the operational
  conclusion — *it isn't coming on this trip* — is the same either way.
- **A left-behind tool loses the record of the trip that skipped it.** The
  `assignedtools` row survives, so the request still names the unit, but nothing
  stores *why*, and a second request assigning the same tool overwrites the
  flag. A reason picker was considered and dropped: there is no Bubble field to
  store one in.
- **An `assignedtools` row pointing at a deleted `tools` row** is skipped by
  `deriveTripStatus` — it survives only in `toolCount`, so the count badge can
  out-count the list by one. Rare enough to leave.
