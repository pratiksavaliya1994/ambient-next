# Phase 5D — delivery backend: materials on trips

Part of [phase 5](./phase-5-materials.md). Needs [5B](./phase-5b-delivery-backend-catalogue-assign.md).
**Backend only** — the builder, run sheet and PDF are [5E](./phase-5e-delivery-frontend-trips.md).

Read [`phase-4-trips.md`](./phase-4-trips.md) and
[`bubble-trip-workflows-spec.md`](./bubble-trip-workflows-spec.md) first. Every
rule there holds for materials; this doc only states what's added.

## Goal

Assigned delivery lines become movable cargo on the existing trips: they appear
in the pool with an outstanding quantity, can be split across trips, get planned
into stops next to tools, are loaded, dropped, skipped or refused by the driver,
and a refused inventory line returns its units to stock when it's unloaded at the
yard. `request.status` follows.

## Scope

**In:** additive edits to `create-trip`, `save-trip`, `cancel-trip`,
`start-trip`, `complete-trip-stop`; two private helpers; the planner, validator,
pool, trip reads/writes, trip schemas, trip actions, settle poll, request
progress.

**Out:** pickup lines (5F). In this slice a material line always travels
`Warehouse → request.job`. Every screen (5E).

## The rules this slice adds

- **One `tripmaterial` row per line per trip.** Two partial loads of one line on
  one trip are one row with the summed qty. `validatePlan` enforces it
  (`duplicate-line`).
- **Delivery origin is always `DEFAULT_WAREHOUSE`.** No site-to-site — see the
  master doc.
- **Outstanding** (from `lineProgress`) = `assignedQty − Σ qty` over the line's
  rows in `Planned`/`Loaded`/`Dropped`/`Refused`, where **a `Planned` row counts
  only while its trip is open** (a `Planned` row can in principle outlive a
  completed trip; it holds nothing). When editing a trip, **its own rows are
  excluded** — the `excludeTripId` rule `listOutstandingMovements` already applies
  to tool claims, applied to quantities.
- A line isn't blocked the way a claimed tool is; a draft holding 12 of 20
  simply leaves 8 in the pool. A line with outstanding 0 is not shown.
- **Refused inventory returns to stock on unload, and releases its allocation.**
  A non-inventory refusal returns nothing and keeps its approval — the item is
  back in the yard and can go out again without re-approval. That asymmetry is
  intended: inventory units are back on the shelf and must be re-assigned.

---

## 1. Bubble Studio — all edits additive

An older client sends none of the new parameters; every new step gates off on an
empty list, and every new return key is ignored by `z.looseObject`. **Save the
Studio edits before the app ships**, never after — the reverse order throws in
`stopResult.parse` *after* drops committed (the §8.1 lesson).

### 1.1 `create-trip-material` (private)

Params: `tripID`, `lineId`, `requestId`, `materialId`, `name`, `unit`, `kind`,
`qty` (number), `fromStopKey`, `fromLocation`, `toStopKey`, `toLocation`. One
step: *Create a new tripmaterial* with `state = "Planned"`, `actualQty` empty.
No return. **Not exposed.**

### 1.2 `create-trip` and `save-trip`

- New parameter **`materials`** — list of objects with the fields above minus
  `tripID`, via Detect Data.
- *Schedule on a list* → `create-trip-material`, only when `materials is not
  empty`. In `create-trip`: same idempotency condition as the other steps, and
  `tripID` = the **key search**, not *Result of step 1* (spec §5 — step 1 is
  skipped on a retry).
- `save-trip` only: *Delete a list of things* — `Search for tripmaterial (tripID
  = tripId)` — **before** the new fan-out, beside the existing `triptool` delete.
  Still behind the `status is "Planned"` Terminate, which is the one thing
  stopping a save from un-delivering real drops.
- Return gains `"materials": "materials:count"`.

### 1.3 `cancel-trip`

Add *Delete a list of things* — `Search for tripmaterial (tripID = tripId)` —
next to the existing two deletes. Nothing to give back: a `Planned` trip hasn't
touched stock (stock moved at **assign**, and stays with the line).

### 1.4 `start-trip`

- New parameter **`materialLineIds`** — text list; lines collected at the
  **first** stop.
- *Make changes to a list* — `Search for tripmaterial (tripID = tripId, lineID is
  in materialLineIds, state = "Planned")`: `state = "Loaded"`, `actualQty = This
  tripmaterial's qty`. Gate on not empty.
- Return gains `"materials": "materialLineIds:count"`.

No stock step: assignment already drew it.

### 1.5 `complete-trip-stop`

New text-list parameters, each optional: `dropMaterialIds`, `loadMaterialIds`,
`skipMaterialIds`, `refuseMaterialIds`, `returnMaterialIds` (all **line ids**).
New steps, each gated on its list being non-empty, and **each constrained on the
row's current `state`** — that constraint is what makes a replayed call a no-op:

| List | Search `tripmaterial (tripID = tripId, lineID in list, state = …)` | Set |
| --- | --- | --- |
| `dropMaterialIds` | `Loaded` | `state = "Dropped"` |
| `loadMaterialIds` | `Planned` | `state = "Loaded"`, `actualQty = qty` |
| `skipMaterialIds` | `Planned` | `state = "Skipped"` |
| `refuseMaterialIds` | `Loaded` | `state = "Refused"` |
| `returnMaterialIds` | `Refused` | → *Schedule on a list* of `return-material-stock` |

Returns gain `materialsDropped`, `materialsLoaded`, `materialsSkipped`,
`materialsRefused`, `materialsReturned` — each the **list's** `:count`, as the
tool keys are.

> A `dropMaterialIds` drop at a `Job` stop writes **nothing to stock** — a
> delivery's stock left the shelf at assignment. 5F adds the one case where a
> drop does touch stock (a pickup unloaded at the yard), as a separate list.

### 1.6 `return-material-stock` (private)

Params: `tripMaterialId`, `tripId`, `byName`. Let *T* = the row, *L* = `Search
for requestedmaterials (unique id = T's lineID):first item`.

**Every step has the condition `T's state is "Refused"`**, evaluated fresh, and
the state flip is **last** — so a retried run, which finds `Returned`, does
nothing at all. Bubble evaluates each step's condition when it reaches it: the
final step's flip must stay final.

1. *Make changes* to `Search for materialitem (unique id = T's materialID):first
   item`: `stockQty = stockQty + T's qty`. Only when `T's kind is "Inventory"`.
2. *Create a new materialstockhistory*: `delta = T's qty`, `stockAfter` = step
   1's result's `stockQty`, `reason = "Return"`, `requestID = T's requestID`,
   `tripID`, `byName`. Only when inventory.
3. *Make changes* to *L*: `assignedQty = L's assignedQty − T's qty`. Only when
   inventory — see "the rules" above for why non-inventory keeps its approval.
4. *Make changes* to *T*: `state = "Returned"`.

Why a fan-out and not a list change: each row touches a **different**
`materialitem`, and *Make changes to a list* can only edit the listed things
themselves.

The fan-out is **asynchronous**, so the returned count is what was sent. Next.js
settle-polls the rows (§2.5) before reporting success.

---

## 2. Next.js

Files already near the 300-line cap (`trips-types.ts`, `trips.ts`,
`movement-types.ts`, `plan.ts`) get **sibling modules** for the material half
rather than growing past it.

### 2.1 Planner and validator — pure, client-safe

| File | Change |
| --- | --- |
| `lib/trips/plan-types.ts` | `MaterialMovement` (`lineId, requestId, materialId, name, unit, kind, qty, from, to`), `PlannedMaterial` (`MaterialMovement` + the four stop fields), and `TripPlan` gains `materials: PlannedMaterial[]` and `noopMaterials`. `TRIP_TOOL_STATE` is reused as the `tripmaterial.state` vocabulary — export an alias `TripMaterialState` rather than a copy |
| `lib/trips/plan.ts` | `planTrip(movements, options, materials = [])` — additive third argument. Internally the graph is built from anything with `from`/`to` (tools and materials become edges of one graph), so stops, split choice and the total tie-break are **unchanged** for a tools-only call. Materialisation assigns stop keys to materials exactly as to tools |
| `lib/trips/validate.ts` | `validatePlan(stops, items, materials = [])`: the collect-before-drop invariant for materials (extend `orderViolations`/`violatingStopKeys`), and a new `PlanProblem` `duplicate-line` |

The builder calls the same functions in the browser; the server re-derives with
them. That's the phase 4 guarantee and it doesn't change.

### 2.2 The pool

| File | Change |
| --- | --- |
| `lib/trips/material-movement-types.ts` (new, pure) | `OutstandingMaterial` (line fields + `outstanding` qty), `selectMaterialMovements(groups, selection: Map<lineId, qty>)` → `{ materials, invalid }` where `invalid` holds any qty outside `1..outstanding` — refused by name, never clamped silently |
| `lib/trips/movement-types.ts` | `RequestMovements` gains `materials: OutstandingMaterial[]`; `shownMovements` keeps a group that has materials but no movable tools |
| `lib/trips/movements.ts` | `listOutstandingMovements` also reads lines + their trip rows for the same requests. **The early `if (assignedRows.length === 0) return []` must go** — it would hide every materials-only request — and the per-request `rows.length === 0` / `movements.length === 0` skips become "no tools **and** no outstanding materials". `from = DEFAULT_WAREHOUSE`, `to = request.job` |

### 2.3 Trip reads and types

| File | Change |
| --- | --- |
| `lib/bubble/trip-materials-types.ts` (new, client-safe) | `TripMaterialRow`; the material halves of `outstandingCollect` / `outstandingDrop` / `refusable` / `isStopDone` / `stillLoaded`, **written against the same definitions** as the tool ones (collect outstanding = `Planned`; drop outstanding = `Loaded` or `Refused`; a warehouse never refuses) |
| `lib/bubble/trips-types.ts` | `TripDetail.materials`; `StopWork` gains `collectMaterials`, `dropMaterials`, `refusedMaterials`; `stopWork` routes refused material rows **by state, not key** — the existing rule, applied to both row kinds in one pass so a return stop is synthesised at most once; `isStopDone` and `stillLoaded` include materials |
| `lib/bubble/tripmaterial-read.ts` | `tripMaterialRow` Zod, `toMaterialRow`, `listTripMaterials(tripIds)`, `listTripMaterialsForLines(lineIds)` now returning each row's **trip status** too (for the open-trip rule), and `listLineTripFlags(lineIds)` — the `listTripFlags` recipe (newest row wins, keyed by request) for "Refused"/"Not loaded" on the request page |
| `lib/bubble/trips-read.ts` | `attachTripRows` and `getTrip` attach `materials`; `readTripPlanKeys` adds `lineIds` |

### 2.4 Trip writes and schemas

| File | Change |
| --- | --- |
| `lib/bubble/trip-material-payload.ts` (new) | `materialPayload(PlannedMaterial)` and the five complete-stop lists, so `trips.ts` stays under its cap |
| `lib/bubble/trips.ts` | `createTrip`/`saveTrip` send `materials` and `assertCounts` checks `materials`; `startTrip(tripId, driver, materialLineIds = [])`; `CompleteStopInput` gains the five material lists and each gets an `assertExact`. Keep the `refused()` empty-response check first, unchanged |
| `lib/schemas/trip.ts` | `materialSelectionSchema` (`{ lineId, qty ≥ 1 }[]`) on `createTripSchema` / `saveTripSchema`; `plannedMaterialSchema`; `completeStopSchema` gains material `ticked` / `refused` line id lists, mirroring the tool fields |
| `lib/trips/settle.ts` | `waitForTripPlan` also waits for the expected `tripmaterial` count; new `waitForMaterialReturns(tripId, lineIds)` polls until those rows read `Returned` |

### 2.5 Actions

- **`createTripAction` / `saveTripAction`** (`app/(app)/trips/actions.ts`) —
  re-read the pool (excluding the edited trip), `selectMaterialMovements`, refuse
  `invalid` by name ("only 8 of Level-Flor left to send"), re-plan with materials,
  `validatePlan`, write, settle.
- **`startTripAction`** — first stop's material collects → `materialLineIds`.
- **`completeStopAction`** — materials follow the tool split exactly: at this
  stop, ticked collects → `loadMaterialIds`, unticked → `skipMaterialIds`; ticked
  drops → `dropMaterialIds`, unticked at a `Job` stop → `refuseMaterialIds`. At a
  **warehouse** stop, ticked drops whose **live** row reads `Refused` →
  `returnMaterialIds` — the tool rule of splitting by re-read state, never by what
  the browser named. Then `waitForMaterialReturns`, then `syncRequestStatuses`
  with the material rows' request ids added.
- **`completeTripAction`** — the "still on the truck" guard names materials too.
- **`closeRequestAction`** — nothing new: 5B already refuses on
  `Planned`/`Loaded`/`Refused` rows, and now there are some.

### 2.6 Request progress

`sync-request-status.ts` and `movements.ts` now pass real trip rows into
`requestProgress`, so delivery lines can finally be **done** and a request can
close on its own. No change to `deriveRequestStatus` beyond 5B's.

---

## Tasks

- [ ] 1. Studio: `create-trip-material`, `return-material-stock` (both **not
      exposed** — check)
- [ ] 2. Studio: `create-trip`, `save-trip`, `cancel-trip`, `start-trip`,
      `complete-trip-stop` additions
- [ ] 3. `plan-types.ts`, `plan.ts`, `validate.ts`
- [ ] 4. `material-movement-types.ts`, `movement-types.ts`, `movements.ts`
- [ ] 5. `trip-materials-types.ts`, `trips-types.ts`
- [ ] 6. `tripmaterial-read.ts`, `trips-read.ts`
- [ ] 7. `trip-material-payload.ts`, `trips.ts`, `schemas/trip.ts`, `settle.ts`
- [ ] 8. Trip actions (create, save, start, complete stop, complete trip)
- [ ] 9. `sync-request-status.ts` / `movements.ts` pass trip rows to progress
- [ ] 10. `npm run typecheck` once, at the end

## Verification

Every run is a real write — note the rows you pick and put them back. Use one
test item and one test request from 5B's verification.

1. **Tools-only regression first:** plan, save, start and complete a tools-only
   trip. Stops, keys and counts identical to before. This proves the planner
   generalisation is additive.
2. `create-trip` with 1 tool + 1 material line (qty 3 of an assigned 5), then
   **re-POST the identical payload** → one trip, one `tripmaterial` (`Planned`,
   qty 3), same `tripId` back.
3. The pool now offers the line with **2** outstanding; opening that trip's editor
   offers **5** (its own rows excluded).
4. `save-trip` with qty changed → still exactly one `tripmaterial` row.
5. `cancel-trip` on a draft → rows deleted, stock unchanged.
6. `start-trip` → row `Loaded`, `actualQty = qty`; stock unchanged.
7. `complete-trip-stop` at the job with the line **refused** → `Refused`, stock
   unchanged. At the return/warehouse stop, ticked → `return-material-stock` →
   `Returned`, stock `+3`, one `Return` history row with `tripID`, line
   `assignedQty − 3`. **Re-send the same call → stock unchanged.** The state gate
   is the thing under test.
8. The line now reads assigned 2 of 5, so re-assign it to 5 (stock `−3`), then a
   second trip drops all 5 → line done; the request auto-closes to `Delivered`
   once its tools have landed too.
9. `complete-trip` refuses while a material row is still `Loaded`, naming it.
