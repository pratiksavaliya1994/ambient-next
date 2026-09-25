# Phase 5F — pickup backend: material pickups

Part of [phase 5](./phase-5-materials.md). Needs the whole delivery flow
(5A–5E) built and verified. **Backend only** — the pickup form, approve UI and
run-sheet counting are [5G](./phase-5g-pickup-frontend.md).

## Goal

A PM raises a pickup for materials on a job — picked from the catalogue or typed,
with a quantity they **enter themselves** (no suggestions: nothing tracks what's
left on site). The warehouse manager approves the lines. The lines go on a trip
from the job to a warehouse; at the collect stop the driver **counts** what they
actually took; when they unload at the yard, inventory lines add that count to
stock. The request closes when every line has come back.

## Scope

**In:** `new-pickup-request` + `materialLines`; two new private helpers and
additive `complete-trip-stop` params; pickup lines in the pool, the stop split,
the progress rule; the pickup and combined-pickup create path; approve in
`assignMaterialsAction`.

**Out:** site-to-site (not supported — master doc). Every screen (5G).

## How a pickup line differs from a delivery line

| | Delivery (5B–5D) | Pickup (this slice) |
| --- | --- | --- |
| Quantity | asked, then allocated from stock | PM's **estimate**; the driver's count is the truth |
| Assign | draws stock; partial allowed | **approve only** — `assignedQty = effectiveQty` or `0`, never stock |
| Route | `Warehouse → job` | `job → warehouse` (choosable, default `DEFAULT_WAREHOUSE`) |
| On a trip | qty can be split across trips | **one trip, whole line** — nothing to split an unknown quantity by |
| Load | `actualQty = qty`, ticked | `actualQty` = **driver's count**; `0` = `Skipped` |
| Drop | at the job, no stock | at the yard, **inventory `+ actualQty`** |
| Done | delivered ≥ quantity | **one `Dropped` row**, whatever was counted |

A skipped pickup line (`0`, or the stop not reached) goes back to the pool,
flagged **Not picked up**.

---

## 1. Bubble Studio — all additive

Same rules as 5D §1: save before the app ships; new steps gate on empty; new
return keys are ignored by `z.looseObject`; private helpers **not exposed**.

### 1.1 `new-pickup-request` + `materialLines`

Exactly the 5B §1.2 addition, on this workflow: a `materialLines` object-list
parameter, a fan-out to the existing private `create-requested-material`
(`requestId` from *Result of step 1* — safe here, per `phase-4-trips.md`'s "As
built" notes), and `"materialLines": "materialLines:count"` in the return.

**Don't touch the existing `status = "Assigned"` on the create step.** It's right
for a pickup naming tools. For a materials-only pickup it's premature — no line
is approved yet — and Next.js corrects it by running `syncRequestStatuses` right
after the create (§2.3), which derives `New`. The ratchet only protects terminal
values, so that write is allowed.

### 1.2 Approve — nothing to build

`assign-material-line` (5B §1.3) already computes *holdsStock* as `false` for a
pickup request and only sets `assignedQty`. **Verify it** in the tests below
rather than trusting it.

### 1.3 `load-trip-material` (private) — the driver's count

Params: `tripId`, `lineId`, `actualQty` (number). Let *T* = `Search for
tripmaterial (tripID = tripId, lineID = lineId):first item`.

1. *Make changes* to *T*: `actualQty = actualQty`, `state = "Loaded"`. Only when
   `T's state is "Planned"` — a replay finds `Loaded` and writes nothing.

A fan-out rather than a list change because each row gets a **different** value.

### 1.4 `land-material-stock` (private) — unload at the yard

Params: `tripMaterialId`, `tripId`, `byName`. Same shape as
`return-material-stock` (5D §1.6), and the same rule: **every step conditioned on
`T's state is "Loaded"`, the state flip last.**

1. `materialitem` (T's `materialID`): `stockQty = stockQty + T's actualQty`. Only
   when `T's kind is "Inventory"` and `T's actualQty > 0`.
2. *Create materialstockhistory*: `delta = T's actualQty`, `stockAfter`,
   `reason = "Return"`, `requestID`, `tripID`, `byName`. Same condition.
3. *T*: `state = "Dropped"`.

No `assignedQty` step: a pickup line never held stock.

### 1.5 `complete-trip-stop` — two more lists

| Parameter | Type | Step |
| --- | --- | --- |
| `countMaterials` | list of objects `{ lineId, actualQty }`, via Detect Data | *Schedule on a list* → `load-trip-material` |
| `landMaterialIds` | text list | *Schedule on a list* over `Search for tripmaterial (tripID = tripId, lineID in landMaterialIds, state = "Loaded")` → `land-material-stock` |

Return gains `materialsCounted` and `materialsLanded` (list counts).

Why not reuse `loadMaterialIds` / `dropMaterialIds`: those are **synchronous list
changes** that write fixed values (`actualQty = qty`) and never touch stock —
correct for deliveries and wrong here. Keeping pickups on their own lists means
no existing step changes and a delivery can never be routed into stock by
mistake.

---

## 2. Next.js

### 2.1 Create

| File | Change |
| --- | --- |
| `lib/schemas/pickup-request.ts` | `materialLines: z.array(materialLineInputSchema)`; the "something to pick up" refine counts tools **or** lines. Inventory lines must name an **active** item |
| `lib/schemas/combined-request.ts` | Same, on the pickup half |
| `lib/bubble/requests.ts` | `createPickupToolRequest` sends `materialLines` (server-resolved names/units, as 5B) and the formatted legacy `materials` text |
| `app/(app)/requests/new/pickup/actions.ts` | Pass lines through; after create, settle-read the lines, then `syncRequestStatuses([requestId])` so a materials-only pickup reads `New` |
| `app/(app)/requests/new/combined/actions.ts` | Same on its pickup call |
| `lib/notify.ts` | Pickup summary lists lines as "to collect" |

### 2.2 Approve

`assignMaterialsAction` (5B): for a pickup request, every line — inventory
included — accepts only `0` or `effectiveQty(line)`, and **no stock check runs**.
The trip-floor guard still applies (can't un-approve a line that's on a trip).

### 2.3 Pool, plan, stops

- `lib/bubble/requested-materials-types.ts` `lineProgress`: a pickup branch —
  outstanding = `effectiveQty` while the line is approved and has **no** `Dropped`
  row and no live row (`Planned` on an open trip, `Loaded`); else `0`. Done = one
  `Dropped` row.
- `lib/trips/movements.ts`: pickup lines `from = request.job`, `to` = the group's
  destination, which is already choosable for pickups — materials follow the same
  choice as the request's tools, so one pickup request goes to one yard.
- `selectMaterialMovements`: for a pickup line the qty is fixed at
  `effectiveQty`; any other qty is `invalid`.
- The planner needs nothing: `job → warehouse` is an ordinary edge, and
  *deliver to Job A + collect from Job A* is the split-the-warehouse case
  `phase-4-trips.md` already handles.

### 2.4 Run the stop

- **`startTripAction`** — **exclude pickup lines** from `materialLineIds`, even
  at the first stop: they need a count, which `start-trip` can't take. They stay
  `Planned` and the driver counts them at the stop through the normal stop action
  (`outstandingCollect` already offers `Planned` rows).
- **`completeStopAction`** — the direction is read **server-side** from each
  row's request, never from the browser. At a job stop, a pickup collect with a
  count `> 0` → `countMaterials`; `0` or unticked → `skipMaterialIds`. At a
  warehouse stop, a ticked pickup row reading `Loaded` → `landMaterialIds`;
  delivery rows keep their 5D routing (`Refused` → `returnMaterialIds`). Then
  settle-poll both fan-outs (`waitForMaterialRows(tripId, lineIds, state)`,
  generalising 5D's `waitForMaterialReturns`), then `syncRequestStatuses`.
- `lib/schemas/trip.ts` — `completeStopSchema` gains `counts: { lineId,
  actualQty: int ≥ 0 }[]`. The count may exceed the estimate: more came back than
  anyone knew about, which is exactly the information the count exists to catch.
- `lib/bubble/trips.ts` + `trip-material-payload.ts` — the two new lists and
  their `assertExact`s.

### 2.5 Status

`deriveRequestStatus` needs nothing new: pickup lines report done through
`lineProgress`, and a pickup's terminal value is already `Returned`, partial
`Partially Returned`. `closeRequestAction` needs nothing: there is no pickup stock
to release, and its trip-row refusal already covers lines on a truck.

---

## Tasks

- [ ] 1. Studio: `new-pickup-request` + `materialLines`
- [ ] 2. Studio: `load-trip-material`, `land-material-stock` (**not exposed** —
      check); `complete-trip-stop` + `countMaterials`, `landMaterialIds`
- [ ] 3. Pickup + combined schemas, `createPickupToolRequest`, both create
      actions, `notify.ts`
- [ ] 4. `assignMaterialsAction` pickup branch
- [ ] 5. `lineProgress` pickup branch; pool and `selectMaterialMovements`
- [ ] 6. `startTripAction` exclusion; `completeStopAction` split;
      `schemas/trip.ts`; `trips.ts` / payload; settle poll
- [ ] 7. `npm run typecheck` once, at the end

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
