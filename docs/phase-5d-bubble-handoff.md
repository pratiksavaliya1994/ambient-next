# Phase 5D — Bubble backend handoff

Companion to [`phase-5d-delivery-backend-trips.md`](./phase-5d-delivery-backend-trips.md).
Covers **Bubble only** (spec §1, tasks 0–2). Next.js tasks 3–11 are not covered here.

**Status:** all Bubble changes built on `version-test`. Not yet verified. The
spec's verification list runs once the Next.js side is done.

**Deploy order:** Bubble goes live **before** the Next.js 5D code, never after (spec §8.1).

> **Fixed 2026-09-28: in `adjust-site-stock`, the floor step now comes before
> the add step.** As first built, the add step came first. Bubble checks each
> condition when it reaches that step, so the floor step then saw the qty the
> add step had already reduced, and subtracted `delta` a second time. Example:
> `floorAtZero = yes`, qty 5, delta −3 gave 0 instead of 2. It was wrong
> whenever a collect took more than half, but not all, of the site's qty. 5D
> never floors, so it could never fire here. **5F's collect verification must
> include a "more than half" collect: 5 on site, collect 3, expect 2.**

> **Fixed 2026-09-29: `complete-trip-stop` step 13 searched `lineID is in
> loadMaterialIds`** instead of `dropMaterialIds` (a copy-paste from step 10).
> At a drop stop that list is empty, so no `drop-material-at-site` run was
> scheduled and material drops stayed `Loaded`. `materialsDropped` still came
> back matching, because it is the *sent* list's `:count`, not what landed.
> The only sign was Next.js's settle warning ("Bubble is still finishing the
> material lines"). **When adding the 5F steps, check that each search's list
> parameter matches its step.**

---

## Deviations from the spec — read first

None of these change the HTTP contract Next.js sends or reads (see *API contract* below).

| # | Spec said | Built as | Why |
| --- | --- | --- | --- |
| D1 | `adjust-site-stock` searches for its site row *S* internally | New parameter **`siteRow`** (type `materialsitestock`). The **caller** runs the search and passes `:first item`. Empty `siteRow` = no row yet | Avoids repeating the search in every step. Fields are still read fresh at run time |
| D2 | `adjust-site-stock` writes history in one step per case (3 steps) | **One** history step. `stockAfter` = nested `:formatted as text` → `:converted to number` (step 1's qty → else step 4's qty → else `0`). No "Only when" | Exactly one of steps 1–4 always runs, so the history row is always written exactly once |
| D3 | `drop-material-at-site` / `return-material-stock` take `tripMaterialId`, `tripId`, `byName` | Take **`tripMaterial`** (type `tripmaterial`) + `byName`. `tripId` is dropped and read from `tripMaterial's tripID` | The caller's *Schedule on a list* already iterates `tripmaterial` things. `state` is still read fresh per step, so the replay gate holds |
| D4 | `save-trip` gated by a `status is "Planned"` Terminate | Gate is the **trigger condition** (`Search for trips:first item's status is Planned`). This was pre-existing. `start-trip` gates the same way; `complete-trip-stop` gates on `In Transit` | Same effect: a non-matching call runs no steps at all |
| D5 | Material steps gated on "list is not empty" | Gated on `…:count > 0` | Equivalent. Matches the existing tool steps |
| D6 | `return-material-stock` step 3 subtracts `T's qty` | Built as specified, with **`qty`** used in all of steps 1–3 (stock +, history `delta`, `assignedQty −`) | Stated explicitly so the three can never drift apart |

Actual Bubble type/field names seen during the build (these match the spec unless noted):

- `tripmaterial` fields: `tripID`, `lineID`, `requestID`, `materialID`, **`name`**, `unit`, `kind`, `qty`, `actualQty`, `fromStopKey`, `fromLocation`, `toStopKey`, `toLocation`, `state`
- The line type appears in the Bubble editor as **`requestedMaterials`**. The spec writes `requestedmaterials`. **Resolved:** the Data API path is `requestedmaterials`, which `lib/bubble/requested-materials.ts` already reads live. The editor spelling only matters inside Studio, where the type is picked from a dropdown.

---

## 1. Schema (task 0)

### `materialsitestock` — new

| Field | Type |
| --- | --- |
| `materialID` | text |
| `materialName` | text |
| `unit` | text |
| `location` | text (job **name**, as `request.job` holds it; never a warehouse) |
| `qty` | number (no default) |

- Privacy rules are recreated from `assignedtools`.
- **Enable Data API** is ticked.
- The type description says "Written only by adjust-site-stock".

### `materialstockhistory` — extended

- New field `location` (text). Empty = warehouse. No backfill.
- The new `reason` values `Deliver` / `Collect` needed no Bubble change, since the field is text.

---

## 2. Private helpers (task 1) — all *Expose as public API* **unchecked**

### 2.1 `create-trip-material`

**Params:** `tripID`, `lineId`, `requestId`, `materialId`, `name`, `unit`, `kind`, `qty` (number), `fromStopKey`, `fromLocation`, `toStopKey`, `toLocation`. All text except `qty`.

**Steps:**
1. Create a new `tripmaterial`: each field mapped from the matching param, `state = Planned`, `actualQty` not set.

No return.

### 2.2 `adjust-site-stock` (see D1, D2)

**Params:** `materialId`, `name`, `unit`, `location`, `reason`, `requestId`, `tripId`, `byName` (text); `delta` (number); `floorAtZero` (yes/no); **`siteRow` (materialsitestock)**.

**Steps** (the floor step must stay **before** the add step; see the fix note at the top):

| # | Action | Only when |
| --- | --- | --- |
| 1 | Create `materialsitestock`: `materialID`, `materialName = name`, `unit`, `location`, `qty = delta` | `siteRow is empty and delta ≥ 0` |
| 2 | Create `materialsitestock`: same fields, `qty = 0` | `siteRow is empty and delta < 0` |
| 3 | Make changes to `siteRow`: `qty = 0` | `floorAtZero is yes and siteRow's qty + delta < 0 and siteRow is not empty` |
| 4 | Make changes to `siteRow`: `qty = siteRow's qty + delta` | `floorAtZero is no or siteRow's qty + delta ≥ 0 and siteRow is not empty` (the order of the terms matters, because Bubble evaluates left to right). After step 3 sets 0, `0 + delta ≥ 0` is false for a negative delta, so this skips |
| 5 | Create `materialstockhistory`: `materialID`, `materialName = name`, `delta`, `reason`, `location`, `requestID`, `tripID`, `byName`, `stockAfter` (per D2) | — |

- This helper is **not idempotent on its own.** It is only ever scheduled by `drop-material-at-site` (and later by 5F's `load-trip-material`). **Never call it from Next.js.**
- Known duplicate-row race: two simultaneous first drops of the same item to the same site can each create a row. This is unchanged from the spec. `groupBySite` sums the duplicates.

### 2.3 `drop-material-at-site` (see D3)

**Params:** `tripMaterial` (tripmaterial), `byName` (text).

**Steps:**

| # | Action | Only when |
| --- | --- | --- |
| 1 | Schedule `adjust-site-stock` (now) — see mapping below | `tripMaterial's state is Loaded and tripMaterial's kind is Inventory` |
| 2 | Make changes to `tripMaterial`: `state = Dropped` | `tripMaterial's state is Loaded` |

Mapping for step 1:
- `materialId` = `materialID`
- `name` = `name`
- `unit` = `unit`
- `location` = `toLocation`
- `delta` = **`actualQty`**
- `floorAtZero` = `no`
- `reason` = `Deliver`
- `requestId` = `requestID`
- `tripId` = `tripID`
- `byName` = `byName`
- `siteRow` = `Search for materialsitestocks (materialID = tripMaterial's materialID, location = tripMaterial's toLocation)`, sorted by Created Date **ascending**, `:first item`. *Ignore empty constraints* is off.

Behaviour:
- A non-inventory row flips to `Dropped` with no site credit.
- On replay, the row is already `Dropped`, so nothing runs.

### 2.4 `return-material-stock` (see D3, D6)

**Params:** `tripMaterial` (tripmaterial), `byName` (text).

**Steps:**

| # | Action | Only when |
| --- | --- | --- |
| 1 | Make changes to `Search for materialitems (unique id = tripMaterial's materialID):first item`: `stockQty = … stockQty + tripMaterial's qty` | `state is Refused and kind is Inventory` |
| 2 | Create `materialstockhistory`: `materialID`, `materialName = tripMaterial's name`, `delta = qty`, `stockAfter = Result of step 1's stockQty`, `reason = Return`, `requestID`, `tripID`, `byName`, no `location` | `Result of step 1 is not empty` |
| 3 | Make changes to `Search for requestedMaterials (unique id = tripMaterial's lineID):first item`: `assignedQty = … assignedQty − tripMaterial's qty` | `state is Refused and kind is Inventory` |
| 4 | Make changes to `tripMaterial`: `state = Returned` | `state is Refused` |

Behaviour:
- A non-inventory refusal only flips to `Returned`. The stock and the approval are untouched, which is intended.
- On replay, the row is already `Returned`, so nothing runs.
- Both searches have *Ignore empty constraints* off.

---

## 3. Edits to existing workflows (task 2)

All new material steps use `tripmaterial` searches with *Ignore empty constraints* **off**.

### 3.1 `create-trip` (Detect data — re-detected with `materials` added; all existing keys and types unchanged)

| # | Step | Only when |
| --- | --- | --- |
| 1 | Create a new trip *(existing)* | `Search for trips:count is 0` |
| 2 | Schedule `create-trip-stop` on a list *(existing)* | same |
| 3 | Schedule `create-trip-tool` on a list *(existing)* | same |
| **4** | **Schedule `create-trip-material` on a list** — Type `Request Data materials`, list `Request Data's materials`, `tripID = Search for trips:first item's unique id` (the key search, not *Result of step 1*), all other params from `This Request Data materials's …` | `Search for trips:count is 0 and Request Data's materials:count > 0` |
| 5 | Return data — **adds `materials` = `Request Data's materials:count`** | — |

### 3.2 `save-trip` (Detect data — re-detected with `materials`; trigger gate: `Search for trips:first item's status is Planned`)

| # | Step |
| --- | --- |
| 1 | Make changes to trip *(existing)* |
| 2 | Delete tripstops *(existing)* |
| 3 | Delete triptools *(existing)* |
| **4** | **Delete a list of `tripmaterial`: `Search for tripmaterials (tripID = Request Data's tripId)`** |
| 5 | Schedule `create-trip-stop` on a list *(existing)* |
| 6 | Schedule `create-trip-tool` on a list *(existing)* |
| **7** | **Schedule `create-trip-material` on a list** — same mapping as `create-trip`, with `tripID` = the same trip-id expression as step 6. Only when `Request Data's materials:count > 0` |
| 8 | Return data — **adds `materials` = `Request Data's materials:count`** |

### 3.3 `cancel-trip`

- **Added:** a *Delete a list of `tripmaterial`* step (`tripID` = the same trip id as the existing deletes), placed after the existing two deletes.
- There is no stock step: a Planned trip has not touched stock.

### 3.4 `start-trip` (manual params; trigger gate: `Search for trips:first item's status is Planned`)

- **New param:** `materialLineIds`, a text **list**, optional.

| # | Step | Only when |
| --- | --- | --- |
| 1–3 | *(existing)* trip + tool load steps | — |
| **4** | **Make changes to list** `Search for tripmaterials (tripID = tripId, lineID is in materialLineIds, state = Planned)`: `state = Loaded`, `actualQty = This tripmaterial's qty` | `materialLineIds:count > 0` |
| 5 | Return data: `ok`, `tools`, **`materials` = `materialLineIds:count`** (number) | — |

### 3.5 `complete-trip-stop` (manual params; trigger gate: `Search for trips:first item's status is In Transit`)

- **New params:** `dropMaterialIds`, `loadMaterialIds`, `skipMaterialIds`, `refuseMaterialIds`, `returnMaterialIds`.
- All are text **lists**, all optional, and all hold **line ids** (`tripmaterial.lineID`).

| # | Step | Search `tripmaterial (tripID = tripId, lineID is in …, state = …)` | Only when |
| --- | --- | --- | --- |
| 1–9 | *(existing tool steps)* | | |
| **10** | Make changes → `state = Loaded`, `actualQty = qty` | `loadMaterialIds`, `Planned` | `loadMaterialIds:count > 0` |
| **11** | Make changes → `state = Skipped` | `skipMaterialIds`, `Planned` | `skipMaterialIds:count > 0` |
| **12** | Make changes → `state = Refused` | `refuseMaterialIds`, `Loaded` | `refuseMaterialIds:count > 0` |
| **13** | Schedule `drop-material-at-site` on a list (`tripMaterial = This tripmaterial`, `byName`) | `dropMaterialIds`, `Loaded` | `dropMaterialIds:count > 0` |
| **14** | Schedule `return-material-stock` on a list (`tripMaterial = This tripmaterial`, `byName`) | `returnMaterialIds`, `Refused` | `returnMaterialIds:count > 0` |
| 15 | Return data — **adds** the five material count keys (below) | | |

**Asynchronous steps:** steps 13–14 are async fan-outs. The `Dropped` / `Returned` flips land after the response, so Next.js must settle-poll (`waitForMaterialRows`).

---

## API contract Next.js must match

### `create-trip` / `save-trip`

The body gains `materials: [...]`. Each object has:
- `lineId`, `requestId`, `materialId`, `name`, `unit`, `kind`, `fromStopKey`, `fromLocation`, `toStopKey`, `toLocation` — all strings
- `qty` — a number

The response gains `materials` (count).

### `start-trip`

- The body gains `materialLineIds: string[]`.
- The response gains `materials` (count).

### `complete-trip-stop`

- The body gains five `string[]` of line ids: `dropMaterialIds`, `loadMaterialIds`, `skipMaterialIds`, `refuseMaterialIds`, `returnMaterialIds`.
- The response gains five number keys, each the `:count` of the list that was sent:
  - `materialsDropped`
  - `materialsLoaded`
  - `materialsSkipped`
  - `materialsRefused`
  - `materialsReturned`

### Private helpers

`create-trip-material`, `adjust-site-stock`, `drop-material-at-site` and `return-material-stock` are **not exposed**. Next.js never calls them.
