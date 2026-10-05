# Phase 5F — pickup backend: material pickups

Part of [phase 5](./phase-5-materials.md). Needs the whole delivery flow
(5A–5E) built and verified. **Backend only** — the pickup form, approve UI and
run-sheet counting are [5G](./phase-5g-pickup-frontend.md).

## Goal

A PM raises a pickup for materials on a job, picked from the catalogue or typed,
with a quantity they **enter themselves**. It's an estimate. 5D's site figure
("delivered, not picked up") is offered as a hint through
`listSiteStockAction`, never as a limit. The warehouse manager approves the
lines. The lines go on a trip from the job to a warehouse. At the collect stop
the driver **counts** what they actually took, and that count comes **off the
site's figure**. When they unload at the yard, inventory lines add that count to
stock. The request closes when every line has come back.

**Added 2026-09-28 — site-to-site transfer.** On a **delivery's** assign page, a
pickup line can instead be **linked** to a delivery line for the same item at
another site. It then travels `A → B`, lands in B's site figure, and counts
toward B's delivery line. The design is in the master doc's
[Site-to-site transfer](./phase-5-materials.md#site-to-site-transfer); this doc
is the build.

## Scope

**In:** three `requestedmaterials` fields (§1.0); `new-pickup-request` +
`materialLines`; two new private helpers and additive `complete-trip-stop`
params; the collect's site debit; pickup lines in the pool, the stop split and
the progress rule; the pickup and combined-pickup create path; approve in
`assignMaterialsAction`; transfer sources, link/unlink, transfer routing, refused
transfers, two-sided status sync (§2.6).

**Out:** every screen (5G).

## How a pickup line differs from a delivery line

|           | Delivery (5B–5D)                                  | Pickup (this slice)                                                                    | Pickup **linked** — transfer (this slice)                                                                                              |
| --------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Quantity  | asked, then allocated from stock                  | PM's **estimate**; the driver's count is the truth                                     | same as pickup                                                                                                                         |
| Assign    | draws stock; partial allowed                      | **approve only** — `assignedQty = effectiveQty` or `0`, never stock                    | linking **is** approving; done from the **delivery's** assign page                                                                     |
| Route     | `Warehouse → job`                                 | `job → warehouse` (choosable, default `DEFAULT_WAREHOUSE`)                             | `A → transferToLocation` (B), **fixed**                                                                                                |
| On a trip | qty can be split across trips                     | **one trip, whole line** — nothing to split an unknown quantity by                     | same as pickup                                                                                                                         |
| Load      | `actualQty = qty`, ticked                         | `actualQty` = **driver's count**; `0` = `Skipped`; **site A `− count`** (floored at 0) | same as pickup                                                                                                                         |
| Drop      | at the job: warehouse untouched, **site `+ qty`** | at the yard, **warehouse `+ actualQty`**                                               | at B: **site B `+ actualQty`**, via 5D's `dropMaterialIds`. B may **refuse** → rides to the yard → warehouse `+ actualQty`, `Returned` |
| Done      | delivered ≥ quantity                              | **one `Dropped` row**, whatever was counted                                            | one `Dropped` **or `Returned`** row. Also feeds B's line's _delivered_                                                                 |

A skipped pickup line (`0`, or the stop not reached) goes back to the pool,
flagged **Not picked up**. A linked line that is skipped keeps its link and
goes back to the pool still heading for B.

---

## 1. Bubble Studio — all additive

Same rules as 5D §1: save before the app ships; new steps gate on empty; new
return keys are ignored by `z.looseObject`; private helpers **not exposed**.

### 1.0 Schema additions (added 2026-09-28)

Add to **`requestedmaterials`**. All are text holding ids or a name, never
links. All are empty on every existing row and on every delivery line:

| Field                 | Notes                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `transferToLineID`    | Set on a **pickup** line only: the unique id of the delivery line it feeds. Empty = goes to a warehouse   |
| `transferToRequestID` | That delivery line's `requestID`, so a status sync can reach it without another read                      |
| `transferToLocation`  | That delivery request's `job` name, the trip destination. It's a snapshot, like `tripmaterial.toLocation` |

Only Next.js writes them, by a plain Data API `PATCH` (§2.6). No workflow reads
them: the trip rows already carry `toLocation`. Update the type's "never
recreated" description to mention the new fields.

Check: `GET /obj/requestedmaterials?limit=3` returns rows unchanged, and Swagger
lists all three fields.

### 1.1 `new-pickup-request` + `materialLines`

Exactly the 5B §1.2 addition, on this workflow: a `materialLines` object-list
parameter, a fan-out to the existing private `create-requested-material`
(`requestId` from _Result of step 1_ — safe here, per `phase-4-trips.md`'s "As
built" notes), and `"materialLines": "materialLines:count"` in the return.

**Don't touch the existing `status = "Assigned"` on the create step.** It's right
for a pickup naming tools. For a materials-only pickup it's premature — no line
is approved yet — and Next.js corrects it by running `syncRequestStatuses` right
after the create (§2.3), which derives `New`. The ratchet only protects terminal
values, so that write is allowed.

### 1.2 Approve — nothing to build

`assign-material-line` (5B §1.3) already computes _holdsStock_ as `false` for a
pickup request and only sets `assignedQty`. **Verify it** in the tests below
rather than trusting it.

### 1.3 `load-trip-material` (private) — the driver's count

Params: `tripId`, `lineId`, `actualQty` (number). Let _T_ = `Search for
tripmaterial (tripID = tripId, lineID = lineId):first item`.

**Every step is conditioned on `T's state is "Planned"`**, and the flip is last.
A replay finds `Loaded` and writes nothing:

1. _Schedule API Workflow_ `adjust-site-stock` (5D §1.7): `materialId = T's
materialID`, `name`, `unit`, `location = T's fromLocation`, `delta = −
actualQty`, **`floorAtZero = yes`**, `reason = "Collect"`, `requestId = T's
requestID`, `tripId`, `byName`. Only when `T's kind is "Inventory"` and
   `actualQty > 0`. _(Added 2026-09-28. Add a `byName` param.)_
2. _Make changes_ to _T_: `actualQty = actualQty`, `state = "Loaded"`.

A fan-out rather than a list change because each row gets a **different** value.

The debit happens at the collect, not at the yard, because that's when the
material leaves the site. It's the same for a transfer: A goes down here,
whichever way the trip goes next. A site with no row yet gets one at `qty 0`,
which is what the floor gives.

### 1.4 `land-material-stock` (private) — unload at the yard

Params: `tripMaterialId`, `tripId`, `byName`. Same shape as
`return-material-stock` (5D §1.6), and the same rule: **every step conditioned on
the row's live state, the state flip last.** The gate is `T's state is "Loaded"`
**or `"Refused"`**. `Refused` is a transfer turned away at B that rode on to the
yard _(added 2026-09-28)_.

1. `materialitem` (T's `materialID`): `stockQty = stockQty + T's actualQty`. Only
   when `T's kind is "Inventory"` and `T's actualQty > 0`.
2. _Create materialstockhistory_: `delta = T's actualQty`, `stockAfter`,
   `reason = "Return"`, `requestID`, `tripID`, `byName`, `location` empty. Same
   condition.
3. _T_: `state = "Dropped"`. Only when `T's state is "Loaded"`.
4. _T_: `state = "Returned"`. Only when `T's state is "Refused"`.

Steps 3 and 4 have opposite conditions, so exactly one runs. After step 3 the
row reads `Dropped`, which step 4's condition rejects.

No `assignedQty` step: a pickup line never held stock, linked or not.

### 1.5 `complete-trip-stop` — two more lists

| Parameter         | Type                                                     | Step                                                                                                                                       |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `countMaterials`  | list of objects `{ lineId, actualQty }`, via Detect Data | _Schedule on a list_ → `load-trip-material`                                                                                                |
| `landMaterialIds` | text list                                                | _Schedule on a list_ over `Search for tripmaterial (tripID = tripId, lineID in landMaterialIds, state = "Loaded")` → `land-material-stock` |

Return gains `materialsCounted` and `materialsLanded` (list counts).

Why not reuse `loadMaterialIds` / `dropMaterialIds`: those are **synchronous list
changes** that write fixed values (`actualQty = qty`) and never touch stock —
correct for deliveries and wrong here. Keeping pickups on their own lists means
no existing step changes and a delivery can never be routed into stock by
mistake.

**A transfer needs nothing more in Studio.** Its drop at B goes in 5D's
`dropMaterialIds`. `drop-material-at-site` credits `T's toLocation` with
`T's actualQty`, which for a pickup row is the driver's count. A refusal at B
goes in 5D's `refuseMaterialIds` (`Loaded → Refused`), and the unload at the yard
goes in `landMaterialIds` above. What differs from a delivery row is only which
list Next.js puts the row in (§2.4).

---

## 2. Next.js

### 2.1 Create

| File                                                       | Change                                                                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/schemas/pickup-request.ts`                            | `materialLines: z.array(materialLineInputSchema)`; the "something to pick up" refine counts tools **or** lines. Inventory lines must name an **active** item                                                  |
| `lib/schemas/combined-request.ts`                          | Same, on the pickup half                                                                                                                                                                                      |
| `lib/bubble/requests.ts`                                   | `createPickupToolRequest` sends `materialLines` (server-resolved names/units, as 5B) and the formatted legacy `materials` text                                                                                |
| `app/(app)/requests/new/pickup/actions.ts`                 | Pass lines through; after create, settle-read the lines, then `syncRequestStatuses([requestId])` so a materials-only pickup reads `New`                                                                       |
| `app/(app)/requests/new/combined/actions.ts`               | Same on its pickup call                                                                                                                                                                                       |
| `lib/notify.ts`                                            | Pickup summary lists lines as "to collect"                                                                                                                                                                    |
| `app/(app)/requests/new/pickup/site-stock-action.ts` (new) | `listSiteStockAction(job)`: `requireSession()`, then 5D's `listSiteStock({ location: job })` grouped by item. It's the pickup form's hint (5G), called when the job is picked. A read, so no `revalidatePath` |

### 2.2 Approve

`assignMaterialsAction` (5B): for a pickup request, every line — inventory
included — accepts only `0` or `effectiveQty(line)`, and **no stock check runs**.
The trip-floor guard still applies (can't un-approve a line that's on a trip).

### 2.3 Pool, plan, stops

- `lib/bubble/requested-materials-types.ts` `lineProgress`: a pickup branch —
  outstanding = `effectiveQty` while the line is approved and has **no**
  `Dropped`/`Returned` row and no live row (`Planned` on an open trip, `Loaded`,
  `Refused`); else `0`. Done = one `Dropped` **or `Returned`** row.
- `lib/trips/movements.ts`: pickup lines `from = request.job`. An **unlinked**
  line's `to` is the group's destination, which is already choosable for pickups:
  materials follow the same choice as the request's tools, so one pickup request
  goes to one yard. A **linked** line's `to` is its `transferToLocation`, and it
  carries a `fixedDestination` flag, so a change of the group's warehouse never
  moves it. The pool row names the destination ("→ Site B").
- The planner needs nothing for transfers either: `A → B` is an ordinary edge.
  When B also has a warehouse delivery on the same trip, B is one stop with
  both drops.
- `selectMaterialMovements`: for a pickup line the qty is fixed at
  `effectiveQty`; any other qty is `invalid`.
- The planner needs nothing: `job → warehouse` is an ordinary edge, and
  _deliver to Job A + collect from Job A_ is the split-the-warehouse case
  `phase-4-trips.md` already handles.

### 2.4 Run the stop

- **`startTripAction`** — **exclude pickup lines** from `materialLineIds`, even
  at the first stop: they need a count, which `start-trip` can't take. They stay
  `Planned` and the driver counts them at the stop through the normal stop action
  (`outstandingCollect` already offers `Planned` rows).
- **`completeStopAction`** — the direction is read **server-side** from each
  row's request, never from the browser. Each case goes to one list:
  - **At a job stop, collecting:** a pickup collect with a count `> 0` →
    `countMaterials`. A count of `0`, or an unticked line → `skipMaterialIds`.
  - **At a job stop, dropping a transfer** (a pickup row `Loaded` whose
    `toStopKey` is this stop): ticked → `dropMaterialIds`; unticked →
    `refuseMaterialIds`, the delivery rule exactly.
  - **At a warehouse stop:** a ticked pickup row reading `Loaded` **or
    `Refused`** → `landMaterialIds`. Delivery rows keep their 5D routing
    (`Refused` → `returnMaterialIds`). Pickup-vs-delivery is decided by the
    row's request, so a refused transfer can never be sent to
    `return-material-stock`. That would decrement the pickup line's
    `assignedQty` and un-approve it.

  Then settle-poll every fan-out with 5D's `waitForMaterialRows(tripId, lineIds,
state)`, then `syncRequestStatuses`, widened as §2.6 says.

- `lib/bubble/trip-materials-types.ts` — `refusable` allows a pickup row at a
  **job drop stop** (a transfer). A warehouse still never refuses, and a pickup
  row's own collect stop is counted, not refused.
- `lib/schemas/trip.ts` — `completeStopSchema` gains `counts: { lineId,
actualQty: int ≥ 0 }[]`. The count may exceed the estimate: more came back than
  anyone knew about, which is exactly the information the count exists to catch.
- `lib/bubble/trips.ts` + `trip-material-payload.ts` — the two new lists and
  their `assertExact`s.

### 2.5 Status

`deriveRequestStatus` needs nothing new: pickup lines report done through
`lineProgress`, and a pickup's terminal value is already `Returned`, partial
`Partially Returned`. `closeRequestAction` has no pickup stock to release, and its
trip-row refusal already covers lines on a truck. It gains one step for
transfers (§2.6).

### 2.6 Transfers (added 2026-09-28)

**Reads.** `lib/bubble/requested-materials.ts` and its `-types` file:

- `MaterialLine` gains `transferToLineId`, `transferToRequestId` and
  `transferToLocation` (`""` when unlinked). `listMaterialLines` reads them.
- `listTransferSources(deliveryLines)`: for the delivery's inventory lines,
  the pickup lines that meet all of these:
  - same `materialID`;
  - on a pickup request at another job, and that request isn't closed;
  - `transferToLineID` empty, or already this delivery's line (so linked ones
    still show);
  - no live trip row, and not done.

  Each comes back with its job, estimate, due date and pickup request id. It
  takes one `in` query on `materialID`, then the requests and trip rows for what
  comes back.

- `listLinkedPickupLines(deliveryLineIds)`: `transferToLineID in …`, plus
  their trip rows. This is the coverage read.

**Progress.** `lineProgress(line, tripRows, linked = [])` gains an optional
third argument, so existing callers keep compiling. For a delivery line:

- `coverage = assignedQty + Σ linked`. A linked line counts `effectiveQty` until
  it has a `Loaded`/`Dropped`/`Refused`/`Returned` row, then that row's
  `actualQty`.
- `delivered` gains Σ `actualQty` of linked rows `Dropped` at the delivery's
  job.
- `outstanding to plan` is **unchanged**. It only ever counts the line's own
  warehouse units, which the linked rows aren't.

`sync-request-status.ts`, `movements.ts` and the request page's read pass
`linked` in.

**Actions.** In `app/(app)/requests/[requestId]/assign/transfer-actions.ts`
(new, beside `material-actions.ts`):

- **`linkTransferAction({ deliveryLineId, pickupLineId })`**
  1. Fresh reads of both lines, both requests and the pickup line's trip rows.
  2. Refuse by name unless all of these hold:
     - both lines are inventory with the same `materialID`;
     - the delivery request is a delivery and the pickup request a pickup,
       neither closed;
     - the jobs differ;
     - the pickup line is unlinked (or already linked to this line: a no-op);
     - it has no live trip row, and it isn't done.
  3. If it isn't approved yet: `assignMaterials(pickupRequestId, [{ lineId,
targetQty: effectiveQty }])`. That's 5B's workflow; _holdsStock_ is `no`
     for a pickup, so no stock moves.
  4. `bubblePatch` the pickup line: the three `transferTo…` fields.
  5. Settle-read the pickup line until the link and `assignedQty` read back.
  6. `syncRequestStatuses([deliveryRequestId, pickupRequestId])`. A failure
     here is a warning, as in `assignToolsAction`.
- **`unlinkTransferAction({ pickupLineId })`**
  - Refuse while the line has a live trip row ("It's on trip … — remove it from
    the draft first") or is done.
  - Otherwise `PATCH` the three fields to empty. The line **stays approved**
    and goes back to heading for the warehouse.
  - Sync both requests.

Retry safety: both `PATCH`es **set** values, and the approve sends a target, so
a replay writes the same thing again.

**`assignMaterialsAction`** (5B) — for a delivery line, the stock-and-bound
check becomes `targetQty ≤ max(0, effectiveQty(line) − linkedCoverage)`. The
error message names the transfer: "10 are coming from Site A".

**`closeRequestAction`** — before 5B's release, in both directions, when the
lines aren't collected yet:

- closing a **delivery** unlinks every pickup line linked to its lines;
- closing a **pickup** unlinks its own linked lines.

Both use the same `PATCH`, and both requests are synced. A linked line that is
`Loaded` is already covered by the existing "finish the trip first" refusal.

**Status sync, two-sided.** A `tripmaterial` row names only the pickup's
request, so `completeStopAction`, `startTripAction` and `cancelTripAction` add
the `transferToRequestID` of every pickup line they touch to the ids they sync.
It's the same lesson as `touchedToolIds` → `listOpenRequestIdsForTools`: forget
it and the delivery at B sits on its old status until something unrelated
touches it.

---

## Tasks

Tasks 0–2 are built from [`phase-5f-bubble-build-sheet.md`](./phase-5f-bubble-build-sheet.md),
which supersedes §1 where they differ (see *As built* below).

- [x] 0. Studio: the three `requestedmaterials` fields (§1.0); Swagger check
- [x] 1. Studio: `new-pickup-request` + `materialLines`
- [x] 2. Studio: `load-trip-material` (with the `Collect` site debit),
      `land-material-stock` (`Loaded` or `Refused`) — **not exposed**, check;
      `complete-trip-stop` + `countMaterials`, `landMaterialIds`
- [x] 3. Pickup + combined schemas, `createPickupToolRequest`, both create
      actions, `notify.ts`, `listSiteStockAction`
- [x] 4. `assignMaterialsAction` pickup branch, and the delivery bound minus
      linked coverage
- [x] 5. `lineProgress` pickup branch + `linked` argument; pool (fixed transfer
      destinations) and `selectMaterialMovements`
- [x] 6. `startTripAction` exclusion; `completeStopAction` split (transfer drops
      and refusals, refused transfers landed); `refusable`; `schemas/trip.ts`;
      `trips.ts` / payload; settle poll
- [x] 7. `listTransferSources`, `listLinkedPickupLines`; `transfer-actions.ts`;
      `closeRequestAction` unlink; two-sided status sync
- [x] 8. `npm run typecheck` once, at the end

## As built (2026-10-01)

**Next.js: built, and it typechecks clean. Not run against Bubble.**

**Bubble: built 2026-10-01, with no deviations from the build sheet.** Not
tested live. The record is the sheet's "Built as" section,
[`phase-5f-bubble-build-sheet.md`](./phase-5f-bubble-build-sheet.md).

**Deploy order: Bubble first, which is now satisfied.** Its step 1 matters most. The coverage read
constrains on `transferToLineID`, and a constraint on a field Bubble doesn't
have is an error, not an empty result. If Next.js ships before the field
exists, every `syncRequestStatuses` call (so every trip action) returns a
"statuses didn't update" warning, and the request page fails.

### Contract changes from §1

The build sheet records these, and the code follows them.

- **`countMaterials` is a text list, `lineId::actualQty`.** It is not an
  object list, because `complete-trip-stop` takes manual parameters (5B's
  `materialLines` lesson). The payload is built by `countWire` in
  `trip-material-payload.ts`.
- **The `landMaterialIds` search has no `state` filter.** §1.5 filtered it to
  `Loaded`, which would have skipped refused transfers. The helper gates on
  live state anyway.
- The helpers take the `tripmaterial` thing (5D's D3).

### Where the build differs from §2

- **The two-sided status sync is central.** §2.6 had `completeStopAction`,
  `startTripAction` and `cancelTripAction` each add the
  `transferToRequestID` they touch. Instead, `syncRequestStatuses` does it
  itself, in `withTransferTargets`: any pickup line it reads with a link pulls
  in that delivery. No caller can forget it, and link, unlink and close get
  the same behaviour for free.
- **A refused transfer's coverage is 0, not its count.** §2.6 said a linked
  line counts its row's `actualQty` once it is `Refused`/`Returned`.
  Verification 14 needs the opposite: B's coverage drops back. It is never
  coming, so `transferCoverage` returns 0 for those states.
- **`startTripAction` is unchanged.** It already sends `materialLineIds`
  empty (5D as built), so there is nothing to exclude.
- **`refusable` is unchanged.** `refusableMaterials` already allows any
  `Loaded` drop at a job stop, and a pickup's own collect stop is never in its
  drop list.
- **`movements.ts` doesn't pass `linked`.** Its `requestProgress` call only
  feeds the pool's tool counts (`landed`/`total`), which links can't change.
  `sync-request-status.ts`, the request page and the assign save do pass it.
- **`counts` is required for every pickup line in `loadMaterialIds`.** A
  count of `0` becomes a skip. Direction comes from each row's request, read
  through `listRequestStopInfo`, which gained `delivery`/`pickup`. If a
  request can't be read, the whole stop is refused rather than guessed.
- **A pickup row can't be refused-then-returned off the yard.** A refused
  transfer ticked at a job stop is refused by name, because sending it to
  `return-material-stock` would un-approve it.
- **The post-create sync runs only for a materials-only pickup.** With tools,
  the `assignedtools` fan-out may not have landed yet, so a sync could derive
  `New` over a correct `Assigned`. The helper is `settle-pickup.ts`, kept out
  of `actions.ts` because `"use server"` would make it a public action.
- **The pickup form keeps its free text beside the lines.** The legacy text
  and the WhatsApp message are the lines' summary followed by the free text.
  When both are present, the request page shows only the lines, because
  `listMaterialLines` drops the legacy row whenever structured lines exist.
  5G should decide whether the free text stays.
- **Pickup lines in the assign save.** `refusePickupLine` allows `0` or the
  whole estimate. It refuses any change once a trip holds the line or it is
  collected, and refuses un-approving a linked line ("unlink first").
- **The delivery bound.** `refuseLine` allows `≤ requested − linkedCoverage`,
  or any decrease. The message names the source jobs, which costs one request
  read, made only when the message is shown.
- **Pool rows.** `OutstandingMaterial` gains `fixedQty` (pickup: all of the
  estimate) and `fixedDestination` (delivery, or a linked transfer).
  `selectMaterialMovements` takes the groups' warehouse choice as a third
  argument, the way `selectMovements` does.
- **The run sheet and pickup form send nothing new yet, until 5G:**
  - The pickup form sends `materialLines: []`.
  - The run sheet sends no `counts`, so ticking a pickup collect is refused
    with "Enter how many … you collected".
  - The builder's qty stepper can lower a pickup line below whole, which shows
    the blocking problem "… goes on one trip whole".
- **New files:**
  - `lib/bubble/material-transfers.ts` holds the coverage and source reads,
    the `PATCH`, the lock reason and the close step;
  - `lib/bubble/material-transfer-types.ts`;
  - `app/(app)/requests/[requestId]/assign/transfer-actions.ts` and
    `transfer-state.ts`;
  - `app/(app)/requests/new/pickup/site-stock-action.ts` and
    `settle-pickup.ts`.
- `app/(app)/requests/[requestId]/page.tsx` is now 501 lines. It was already
  over the cap before 5F (5E noted 497) and still needs splitting.

## Verification

Real writes on chosen rows, as always. Note the test item's stock before starting.

1. **Delivery regression first:** one delivery line through a full trip,
   unchanged from 5D.
2. Materials-only pickup, one inventory line (estimate 10) + one other-item line
   → two lines, `request.status` **`New`** after the sync.
3. Approve both → `assignedQty` set, **stock unchanged**, no history row, status
   `Assigned`.
4. Trip `job → Warehouse`; start → the lines stay `Planned` (not loaded by
   `start-trip`).
5. At the job, count 7 for the inventory line, untick the other → one `Loaded`
   with `actualQty` 7, one `Skipped`. **Re-send the call → nothing changes.**
6. At the warehouse, unload → `Dropped`, stock `+7`, one `Return` history row
   with `tripID`. **Re-send → stock unchanged.**
7. Request is `Partially Returned` (the skipped line is outstanding, flagged Not
   picked up). A second trip collects it → `Returned`.
8. Tool + material pickup on one request: both on one trip to the same yard;
   status closes only when both are back.
9. **Site debit:** step 5's count of 7 took the job's site figure down by 7,
   floored at 0, with one `Collect` history row. The replay in step 5 took
   nothing more.

**Transfers.** Use a delivery at job B (inventory line, qty 10, nothing
assigned) and a pickup at job A (same item, estimate 6).

10. `listTransferSources` for B's line lists A's line. Link it:
    - A's line is approved;
    - the link fields are set;
    - **no stock or history changes**;
    - both requests are re-synced.
11. The assign bound for B's line is now `10 − 6 = 4` from stock. Assigning 5
    is refused, naming the transfer.
12. Trip `A → B`:
    - At A, count 6 → A's site figure `− 6` (`Collect`).
    - At B, drop → B's site figure `+ 6` (`Deliver`).
    - A's pickup line is done; its row reads `Dropped`, and the pickup request
      reads `Returned` (the request status).
    - B's line reads 6 delivered and stays open for the rest.
    - **Re-send each stop call → nothing moves twice.**
13. Unlink, once the line is on a draft trip → refused. Before the trip → the
    line stays approved and heads for the warehouse.
14. **Refused transfer:** link another pickup and plan it `A → B`.
    - B refuses → the row reads `Refused` and rides on to the yard.
    - Unload there → warehouse `+ count`, row `Returned`. The pickup is done.
    - B's line coverage drops back.
    - The pickup line's `assignedQty` is **unchanged** (not un-approved).
15. Close B's delivery while a linked line hasn't been collected yet → the link
    is cleared first, and the pickup heads for the warehouse.
