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

**Added 2026-09-28: site stock.** An inventory line dropped at a job is also
credited to that site in the new `materialsitestock` table. Every site change
is audited in `materialstockhistory` with a `location`, and Next.js gets the
reads the 5E site view needs. See the master doc's
[Site stock](./phase-5-materials.md#site-stock).

## Scope

**In:** the `materialsitestock` table and `materialstockhistory.location`
(§1.0); additive edits to `create-trip`, `save-trip`, `cancel-trip`,
`start-trip`, `complete-trip-stop`; four private helpers; the planner,
validator, pool, trip reads/writes, trip schemas, trip actions, settle poll,
request progress; site-stock reads (§2.7).

**Out:** pickup lines, including the pickup collect's site debit and transfers
(5F). In this slice a material line always travels `Warehouse → request.job`.
Every screen (5E).

## The rules this slice adds

- **One `tripmaterial` row per line per trip.** Two partial loads of one line on
  one trip are one row with the summed qty. `validatePlan` enforces it
  (`duplicate-line`).
- **A delivery line's own rows always start at `DEFAULT_WAREHOUSE`.**
  Site-to-site arrives in 5F as **pickup** lines linked to a delivery line.
  Those rows belong to the pickup line and start at its job, so nothing here
  changes for them.
- **An inventory drop at a job credits that site** (`Deliver`). A refusal, a
  skip or a non-inventory drop writes no site row.
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

### 1.0 Schema additions (added 2026-09-28)

Same conventions as [5A](./phase-5a-material-schema.md#conventions--read-before-building):
`…ID` fields are text holding a unique id, never links, and `reason`/`location`
are text, never option sets.

**`materialsitestock` (new)** — one row per catalogue item per job site.

| Field | Type | Notes |
| --- | --- | --- |
| `materialID` | text | `materialitem` unique id |
| `materialName` | text | Snapshot, so the site view reads after a rename |
| `unit` | text | Snapshot |
| `location` | text | The job **name**, exactly as `request.job` holds it. **Never a warehouse name**: warehouse stock stays on `materialitem.stockQty` |
| `qty` | number | Delivered and not picked up. **Only ever written by workflows** (`adjust-site-stock`) |

Privacy rules copied from `assignedtools`; tick **Enable Data API**. Put
"written only by adjust-site-stock" in the type's description in Studio.

**`materialstockhistory` (extend)** — add **`location`** (text). Leave it empty
for the warehouse; every existing row is warehouse, so nothing needs
backfilling. `stockAfter` on a site row is that site's `qty`. Two new `reason`
values, **`Deliver`** and **`Collect`**. `reason` is text, so Bubble needs no
change for them, but Next.js does (§2.7).

Check afterwards: `GET /obj/materialsitestock` returns an empty `results`, not a
404, and Swagger lists `qty` as a number.

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
| `dropMaterialIds` | `Loaded` | → *Schedule on a list* of `drop-material-at-site` (§1.7). **Not** a list change: each inventory row credits a different site row |
| `loadMaterialIds` | `Planned` | `state = "Loaded"`, `actualQty = qty` |
| `skipMaterialIds` | `Planned` | `state = "Skipped"` |
| `refuseMaterialIds` | `Loaded` | `state = "Refused"` |
| `returnMaterialIds` | `Refused` | → *Schedule on a list* of `return-material-stock` |

Returns gain `materialsDropped`, `materialsLoaded`, `materialsSkipped`,
`materialsRefused`, `materialsReturned` — each the **list's** `:count`, as the
tool keys are.

> A `dropMaterialIds` drop at a `Job` stop writes **nothing to warehouse
> stock**, because a delivery's stock left the shelf at assignment. It does
> credit the **site** (§1.7). 5F adds the one case where a drop touches the
> warehouse (a pickup unloaded at the yard), as a separate list. 5F's transfer
> drops at a job reuse `dropMaterialIds` unchanged.

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

### 1.7 Site stock helpers (added 2026-09-28) — both private

**`adjust-site-stock`** — the only writer of `materialsitestock`. 5F's collect
reuses it.

| Parameter | Type |
| --- | --- |
| `materialId`, `name`, `unit`, `location` | text |
| `delta` | number (signed) |
| `floorAtZero` | yes/no — `yes` on a collect |
| `reason` | text — `Deliver` or `Collect` |
| `requestId`, `tripId`, `byName` | text |

Let *S* = `Search for materialsitestock (materialID = materialId, location =
location)`, sorted by Created Date ascending.

1. *Create a new materialsitestock*: `materialID`, `materialName = name`,
   `unit`, `location`, `qty = delta` (or `0` when `delta < 0`). Only when `S
   :count is 0`.
2. *Make changes* to `S:first item`: `qty = qty + delta`. Only when `Result of
   step 1 is empty`. When `floorAtZero` and `qty + delta < 0`, set `qty = 0`
   instead, as two steps with opposite conditions. Don't let a search here
   decide whether step 1 ran: a search can miss a row made earlier in the same
   run.
3. *Create a new materialstockhistory*: `materialID`, `materialName`, `delta`,
   `stockAfter` (step 1's or step 2's result's `qty` — one step per case, each
   with its step's condition), `reason`, `location`, `requestID`, `tripID`,
   `byName`.

**It is not idempotent on its own.** It is only ever *scheduled* by a helper
that is gated on the row's `state` and flips that state **after** scheduling
it: `drop-material-at-site` below, and 5F's `load-trip-material`. A replay finds
the state flipped and schedules nothing. **Never expose it, and never call it
from Next.js.**

**`drop-material-at-site`** — params `tripMaterialId`, `tripId`, `byName`. Let
*T* = the row. **Every step is conditioned on `T's state is "Loaded"`**, and the
flip is last:

1. *Schedule API Workflow* `adjust-site-stock`: `materialId = T's materialID`,
   `name`, `unit`, `location = T's toLocation`, `delta = T's actualQty`,
   `floorAtZero = no`, `reason = "Deliver"`, `requestId = T's requestID`,
   `tripId`, `byName`. Only when `T's kind is "Inventory"`.
2. *Make changes* to *T*: `state = "Dropped"`.

`actualQty` rather than `qty`: they are equal on a delivery row (`start-trip`
sets it), and 5F's transfer rows carry the driver's count there.

`complete-trip-stop`'s `dropMaterialIds` step becomes *Schedule on a list* of
`drop-material-at-site` over `Search for tripmaterial (tripID = tripId, lineID
in dropMaterialIds, state = "Loaded")`. The parameter, the return key
`materialsDropped` and the no-op-on-replay behaviour are unchanged. What changes
is that the flip is now **asynchronous**, hence §2.5's settle.

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
| `lib/trips/settle.ts` | `waitForTripPlan` also waits for the expected `tripmaterial` count; new **`waitForMaterialRows(tripId, lineIds, state)`** polls until those rows read `state`. It is used for `Returned` (refused units unloaded) **and** `Dropped` (job drops, async since §1.7). This was 5F's generalisation, moved here because 5D needs it first; 5F reuses it for its counts and landings |

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
  the browser named. Then `waitForMaterialRows` for the drops (`Dropped`) and
  the returns (`Returned`), then `syncRequestStatuses` with the material rows'
  request ids added.
- **`completeTripAction`** — the "still on the truck" guard names materials too.
- **`closeRequestAction`** — nothing new: 5B already refuses on
  `Planned`/`Loaded`/`Refused` rows, and now there are some.

### 2.6 Request progress

`sync-request-status.ts` and `movements.ts` now pass real trip rows into
`requestProgress`, so delivery lines can finally be **done** and a request can
close on its own. No change to `deriveRequestStatus` beyond 5B's.

### 2.7 Site stock reads (added 2026-09-28)

5E's site view is built on these.

| File | Change |
| --- | --- |
| `lib/bubble/material-items-types.ts` | `STOCK_REASON` gains **`Deliver`** and **`Collect`**. `StockHistoryEntry` gains `location` (`""` = warehouse). **This must be live before Bubble writes either reason.** The history reader parses `reason` with `z.enum(STOCK_REASON)`, so an unknown value throws and breaks `/materials/[itemId]`. In practice nothing writes them until this slice's trips run, so ship it with the rest of 5D |
| `lib/bubble/material-items.ts` | The history row Zod gains optional `location`; `listStockHistory(materialId)` returns it. The item page keeps one mixed list, and 5E labels each row's location |
| `lib/bubble/site-stock-types.ts` (new, client-safe) | `SiteStockRow` (`materialId, materialName, unit, location, qty, modifiedAt`); `groupBySite(rows)` → per-location item lists, **adding up duplicate `(materialId, location)` rows** (master doc, *One helper*), dropping `qty ≤ 0`, newest movement first; `siteTotalsFor(rows, materialId)` for the item page |
| `lib/bubble/site-stock.ts` (new, `server-only`) | `listSiteStock({ location?, materialIds? })` via `bubbleListMaybeMissing`; `listSiteHistory(location)` (`materialstockhistory` where `location = …`, newest first). **Never memoised**, for the reason `material-items.ts` isn't |
| `scripts/check-bubble.ts` | Read path for `materialsitestock`: row count, distinct locations, and any `location` with no matching `jobs.name` (the typo guard `tools.location` already has) |

---

## Tasks

Tasks 0–2 were built 2026-09-28 and are not yet verified. The as-built record,
including deviations D1–D6 and the `adjust-site-stock` step-order fix, is
[`phase-5d-bubble-handoff.md`](./phase-5d-bubble-handoff.md).

- [x] 0. Studio: `materialsitestock` + `materialstockhistory.location` (§1.0);
      privacy, API tick, empty-`results` check
- [x] 1. Studio: `create-trip-material`, `return-material-stock`,
      `adjust-site-stock`, `drop-material-at-site` (all **not exposed** — check)
- [x] 2. Studio: `create-trip`, `save-trip`, `cancel-trip`, `start-trip`,
      `complete-trip-stop` additions (`dropMaterialIds` as a fan-out, §1.7)
- [x] 3. `plan-types.ts`, `plan.ts`, `validate.ts`
- [x] 4. `material-movement-types.ts`, `movement-types.ts`, `movements.ts`
- [x] 5. `trip-materials-types.ts`, `trips-types.ts`
- [x] 6. `tripmaterial-read.ts`, `trips-read.ts`
- [x] 7. `trip-material-payload.ts`, `trips.ts`, `schemas/trip.ts`, `settle.ts`
- [x] 8. Trip actions (create, save, start, complete stop, complete trip)
- [x] 9. `sync-request-status.ts` / `movements.ts` pass trip rows to progress
- [x] 10. Site stock reads: `STOCK_REASON` + history `location`,
      `site-stock-types.ts`, `site-stock.ts`, `check-bubble` (§2.7)
- [x] 11. `npm run typecheck` once, at the end

## Next.js — as built (2026-09-28)

Built and typechecks clean. Not run against Bubble yet. The verification list
below needs 5E's screens, or hand-built action calls, because nothing in
today's UI can select a material.

Where the build differs from §2, or adds to it:

- **`startTripAction` sends `materialLineIds` empty.** §1.4/§2.5 had start
  load the first stop's delivery lines. The code had already stopped loading
  tools at start, because a pre-loaded first stop is ticked off before the
  driver has said what went into the van (see `startTrip`'s comment). The same
  applies to materials, so the driver ticks them at the first stop through
  `loadMaterialIds`. Bubble's `start-trip` step 4 stays built but unused, and
  5F's "exclude pickup lines from `materialLineIds`" becomes moot. To switch
  back, pass the first stop's `outstandingCollectMaterials` line ids to
  `startTrip`.
- **Warehouse-bound material drops are refused.** The pool leaves out a
  delivery line whose `request.job` is a warehouse name, and `completeStopAction`
  refuses a non-refused material drop at a `Warehouse` stop. Either would send
  `drop-material-at-site` a warehouse `toLocation`, and site stock never holds
  the yard. 5F lifts the second guard when pickup unloads arrive.
- **New count keys are read as 0 when absent** (`materials` on create/save/start,
  the five `materials…` keys on complete-stop). A missing key with an empty
  list passes. With a non-empty list it throws, which is the only case that
  means Bubble ignored the materials.
- **The open-trip rule lives in `lineProgress`** and applies when a row carries
  `tripStatus`. `listTripMaterialsForLines` now always sets it (one extra
  `trip` read, only when rows exist), so the assign page's floor also stops
  counting a `Planned` row stranded on a completed trip. Close request's
  in-motion guard is unchanged (§2.5) and still counts one.
- **Files beyond §2's table:**
  - `app/(app)/trips/[tripId]/stop-materials.ts`: the material half of
    `completeStopAction` (validate, split returns, settle).
  - `trip-material-payload.ts` also holds `assertPlanCounts` and
    `assertStartCounts`, so `trips.ts` stays under 300 lines.
  - `material-items.ts` exports `toStockHistoryEntry` for `site-stock.ts`.
- **Action state:** `TripDraftState.saved` gains `materials?`, and
  `TripRunState["stop-done"]` gains the five material counts.
- **Before 5E:** `shownMovements` keeps materials-only groups, so the current
  builder shows them as request headings with no tool rows. That is harmless,
  but it looks empty until 5E renders the lines. `MaterialStockHistory` has
  placeholder chip styles for `Deliver`/`Collect`.

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
10. **Site credit:**
    - The drop of 5 in step 8 creates one `materialsitestock` row for that job,
      with `qty` 5.
    - It also writes one `Deliver` history row with `location` = the job and
      `stockAfter` 5.
    - **Re-send the same `complete-trip-stop` → still one row, still 5.** The
      state gate is again the thing under test.
    - A second delivery of 2 to the same job → the same row reads 7. No second
      row.
11. The refused run in step 7 wrote **no** site row. A non-inventory line
    dropped at a job writes none either.
12. `check-bubble` shows the new table, and no unmatched `location`.
