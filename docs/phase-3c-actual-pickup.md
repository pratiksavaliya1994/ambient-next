> **Superseded by [`phase-4-trips.md`](./phase-4-trips.md) (2026-09-15). Not
> built, and not to be built.**
>
> This slice was "the driver collects the tools." Once a trip is an ordered list
> of stops, that is simply a **collect at a stop** — the same row, the same
> workflow and the same screen a delivery uses, with no pickup-specific route,
> action or component. Its left-behind case survives intact as
> `triptool.state = "Skipped"`, which writes `statusNew` and nothing else,
> exactly as specified below.
>
> Kept as the record of what the pickup lifecycle was meant to do, and of the
> decisions phase 4 inherited from it — `Returned` as the terminal status, and
> the partial-pickup rule.

# Phase 3C — actual pickup

Read [`phase-3-pickup-lifecycle.md`](./phase-3-pickup-lifecycle.md) first.
[`phase-3a-condition-split.md`](./phase-3a-condition-split.md) and
[`phase-3b-pickup-assignments.md`](./phase-3b-pickup-assignments.md) must both
be complete: 3A is what stops this slice destroying the PM's condition pick,
and 3B is what gives it a set of tools to select from.

## Scope

**In:** the driver/PM screen that collects tools from site — a subset
selection, a driver, the `In Transit` write, the left-behind write, and the
`Returned` status value entering the code's status maps.

**Out:** the warehouse leg — 3D.

## What it is

A driver arrives on site and takes **what is ready**. Not everything requested
will be: a tool may still be in use, buried, or already gone. So the screen's
job is to record *what actually went on the truck*, which is a subset of what
3B recorded.

This is delivery's dispatch step with the location arrow reversed, and the
middle hop is byte-identical — which is why the write reuses
`dispatchRequests` rather than adding a function.

## Checklist

- [ ] **1. Status vocabulary** — `Returned` into `REQUEST_STATUS` and the three
      presentation maps; `lifecycleFor` for the stepper
- [ ] **2. Extract the driver picker** out of `dispatch-board.tsx`
- [ ] **3. The route, read-only** — page, loading, panel
- [ ] **4. The write** — `pickupSchema`, `pickupAction`
- [ ] **5. Active trips** — per-stop action branches on `pickup`

---

## 1. Status vocabulary

`REQUEST_STATUS` gains **`Returned`**. `request.status` is text in Bubble, so
this costs nothing on the Bubble side — only the code maps learn it.

```ts
export const REQUEST_STATUS = ["New", "Assigned", "In Transit", "Delivered", "Returned"] as const
```

Consumers, all keyed on `RequestStatus` and all needing the new value:

| File | Map |
| --- | --- |
| `components/request-status-badge.tsx` | `STATUS_THEMES` — theme + icon. Reuse `Delivered`'s "done" treatment; a returning-to-base icon distinguishes it |
| `app/(app)/requests/page.tsx` | `NEXT_ACTIONS` — `Returned` is terminal, so `href: null`, rendered as a pill. The card drops its second footer button, as `Delivered` already does |
| `app/(app)/requests/[requestId]/page.tsx` | `NextAction` — same |

### The stepper needs a lifecycle, not a flat list

`StatusStepper` renders `REQUEST_STATUS` in order. With two terminal branches
that no longer works: a delivery would show a `Returned` step it can never
reach, and vice versa.

Add a small helper — `lifecycleFor(request)` — returning
`["New", "Assigned", "In Transit", "Delivered"]` or
`["New", "Assigned", "In Transit", "Returned"]`, and drive the stepper and
`statusIndex` off it rather than off the constant. Put it beside `statusIndex`
in `components/request-status-badge.tsx`, which is already the single source of
truth for lifecycle colour, icon and ordering.

Branch on `request.pickup`. A request with **both** `delivery` and `pickup`
true has two lifecycles and one status field — out of scope per the master doc;
have `lifecycleFor` prefer the delivery track so the latent case renders
something sane rather than throwing.

---

## 2. Extract the driver picker

`components/dispatch-board.tsx` holds a driver `Select` fed by
`listFieldPms()` ∪ `listUsers()` with a free-text `Input` fallback. This slice
is its second consumer, so it moves to **`components/driver-picker.tsx`** per
`CLAUDE.md`'s rule — *"anything reusable across more than one feature goes in a
shared folder, not left local to the page that happened to need it first."*

Extract as-is; don't redesign it. `dispatch-board.tsx` is 266 lines and loses
some, which also buys it headroom.

> **`driver` stays free text.** `pms` is 12 Project Managers and `user` is 13
> display names; neither is a driver roster, and no such table exists in Bubble
> (`phase-2bc-dispatch-offload.md` searched for one). The merged list is a
> quick-pick convenience, nothing more.

---

## 3. The route

Its own route, not a dialog. Offload got a dialog because it is one
confirmation; this screen carries a **subset selection plus a driver**, which
is a form. It mirrors `/assign` in shape and `/dispatch` in mechanics.

| Path | Purpose |
| --- | --- |
| `app/(app)/requests/[requestId]/pickup/page.tsx` | The screen |
| `app/(app)/requests/[requestId]/pickup/loading.tsx` | Skeleton |
| `app/(app)/requests/[requestId]/pickup/actions.ts` | `pickupAction` |
| `components/pickup-confirm-panel.tsx` | The client island |

Fetch — all cheap, no `Suspense` boundary needed (unlike `/assign`, this reads
no candidate pool):

```ts
const request = await getRequest(requestId)                  // 2 calls via withLines
const assigned = await listAssignedTools([requestId])        // one `in` query
const [tools, pms, users] = await Promise.all([
  listToolsByIds(assigned.map((a) => a.toolId)),             // names, floor, condition
  listFieldPms(),                                            // memoised, free
  listUsers(),                                               // memoised, free
])
```

> **`listToolsByIds` is the right reader here, and deliberately unfiltered.**
> It applies no `isAssignable` check — a tool already on a request must stay
> visible or it becomes impossible to act on. A tool the PM flagged
> `Repair Required` at request time is exactly a tool the driver still needs to
> see and collect.

`components/pickup-confirm-panel.tsx` — checkbox list of the recorded tools,
**all checked by default** (taking everything is the common case; unchecking is
the exception). Each row shows name, type, floor and **condition badge**, so
the driver can see what they were warned about. Selected rows get
`border-primary` + a ring, matching `dispatch-board.tsx` — a multi-select must
not hide what is picked. Driver picker below, one submit button.

Keep it under 100 lines per `CLAUDE.md`; the tool row is a candidate for
reusing `components/tool-row.tsx` or the badge component 3A extracts.

---

## 4. The write — `pickupAction`

`lib/schemas/assignment.ts` gains:

```ts
export const pickupSchema = z.object({
  requestId: z.string().min(1),
  driver: z.string().min(1),
  toolIds: z.array(z.string().min(1)).min(1),
})
```

`toolIds` is `min(1)` — a pickup where nothing was ready is not a pickup;
that request should be left alone or rescheduled, not marked collected.

Steps, in order:

1. `await requireSession()`.
2. **Fresh re-read guard** — `getRequest(requestId)`; reject unless
   `status === "Assigned"` **and** `request.pickup`. This is the third instance
   of a pattern already in `dispatchAction` and `offloadAction`; message in the
   same voice: *"This request is already {status}. Reload the page."*
3. Re-read `assignedtools` for the request and **reject any submitted id not in
   it**. Never trust the client's copy — the same call `dispatchSchema` and
   `offloadSchema` make by deriving tool ids server-side.
4. Compute `leftBehind` = recorded ids − submitted ids.
5. **If `leftBehind` is non-empty**, replace the recorded set with what was
   actually taken:
   `assignTools(requestId, takenEntries)` → `create-assigned-tool`, whose
   delete-first step makes this idempotent. Carry each row's existing
   `toolType` and `extra` through unchanged — this is a subset, not a
   re-derivation.
6. **The movement write — reuse `dispatchRequests` verbatim:**
   ```ts
   await dispatchRequests([requestId], driver, toolIds)
   ```
   Its payload is already exactly right: `status: "In Transit"`, `driver`,
   `toolStatus: TOOL_STATUS_IN_TRANSIT`, `toolLocation: driver`,
   `toolUser: driver`. No new lib function, no new workflow. Add a comment at
   the call site saying why a function named for dispatch is correct here, so
   nobody "fixes" it into a duplicate.
7. **If `leftBehind` is non-empty**, one more `update-request-status` call:
   `requestIds: [requestId]`, `status: "In Transit"` (unchanged — idempotent),
   `toolIds: leftBehind`, `toolStatus: "Pickup Requested"`, and **no
   `toolLocation` / `toolUser`**.

   > The workflow guards every optional param with *only when not empty*, so
   > omitting `toolLocation` leaves those tools' job `location` untouched —
   > which is precisely what keeps them findable by
   > `listToolsForJob(job)` for the next pickup request. This behaviour is the
   > whole reason the left-behind rule works without a new workflow.

8. `revalidatePath` on `/requests`, `/requests/{id}`, `/dispatch/active` and
   `/tools`.

A new `PickupState` discriminated union in
`app/(app)/requests/[requestId]/pickup/action-state.ts` (its own file — a
`"use server"` module may only export async functions), mirroring
`DispatchState`, including the non-fatal `warning` for a tool-count mismatch.

---

## 5. Active trips

`app/(app)/dispatch/active/page.tsx` and `components/active-trips.tsx` need
**no data change**: `listRequestsByStatus("In Transit")` already returns
pickups, and `toDispatchSummaries` (`lib/dispatch/summary.ts`) already groups
their physical tools. A driver holding a delivery and a pickup at once sees
both stops on one manifest, which is correct.

The only change is the per-stop action, which branches on `pickup` to reach
3D's return dialog instead of Complete delivery.

---

## Verification

On **one** deliberately-chosen pickup request, do a **partial** pickup —
uncheck at least one tool — and confirm:

- taken tools: `statusNew = "In Transit"`, `location` = the driver's name,
  `currentUser` = the driver;
- **left-behind tools: `statusNew = "Pickup Requested"` and `location` still
  the job's name.** Then confirm `listToolsForJob(job)` still returns them, by
  opening a new pickup request for that job — that round trip is the real proof
  the left-behind rule works;
- `assignedtools` now holds **only** the taken tools;
- `request.status = "In Transit"`, `driver` set, and the request appears on that
  driver's manifest at `/dispatch/active`;
- **`condition` is untouched on every tool involved** — taken and left behind.
  That is 3A's payoff and the reason this slice was ordered third;
- exactly **one** `toolshistory` row per moved tool, not two. The duplicate-row
  bug removed on 2026-09-10 is the regression to watch
  (see [`bubble-update-request-status-spec.md`](./bubble-update-request-status-spec.md)).

Then the guards:

- reload the screen for the same request and confirm it refuses — the request
  is `In Transit`, not `Assigned`;
- a delivery request still dispatches and completes normally, and its stepper
  shows `Delivered`, not `Returned`.

Writes hit the **live** database.

## Known limits

- **Partial pickup loses the requested-but-not-taken set from
  `assignedtools`.** `requestedtools.toolsSummary` still names every originally
  requested tool, so "3 of 5" remains readable on the detail page — but the
  ids of the two left behind are no longer linked to this request. Accepted
  deliberately: they stay flagged `Pickup Requested` at the job, which is the
  state that matters.
- **Two calls, no transaction.** If step 7 fails after step 6 succeeds, the
  taken tools have moved and the left-behind ones still read `Pickup Requested`
  from 3B — which is the correct value anyway. The failure is therefore benign;
  surface it as a `warning`, not an error.
- **`min(1)` on `toolIds`** means "nothing was ready" has no recorded outcome.
  A request stays `Assigned` in that case, which is honest but leaves no note
  of the wasted trip.
- **No re-entry.** Once a request is `In Transit` this screen refuses it, so a
  forgotten tool cannot be added to the same request. That follows directly
  from the partial-pickup decision in the master doc.
