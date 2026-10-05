# Phase 5F — Bubble Studio build sheet (material pickups)

Step-by-step Studio changes for phase 5F. Companion to
[`phase-5f-pickup-backend.md`](./phase-5f-pickup-backend.md) §1 (tasks 0–2).
Once built, record anything that came out differently in a "Built as" section
at the bottom, as [`phase-5d-bubble-handoff.md`](./phase-5d-bubble-handoff.md)
does.

> **Deviations from the 5F spec.** This sheet changes three things in §1, and
> the Next.js side is written against this sheet, not the spec:
>
> 1. **`countMaterials` is a text list, `lineId::actualQty`, not a list of
>    objects.** `complete-trip-stop` uses manual parameters. An object list
>    would mean moving the whole workflow onto Detect Data, the trap 5B hit with
>    `materialLines` (5B §1.4).
> 2. **The `landMaterialIds` search has no `state` constraint.** The spec
>    filtered it to `state = "Loaded"`. That would drop every refused transfer
>    (`Refused`), which `land-material-stock` exists to land. The helper gates
>    each step on the row's live state, so an unfiltered search is safe.
> 3. **The helpers take the `tripmaterial` thing, not ids** (D3 in the 5D
>    handoff). The caller runs the search and passes `:first item`.

---

## 0. Context

### The app

- The Bubble app is `cfaner`. It is **live**: `version-test` is the only
  version in use, with real data. Treat every test as a real write.
- A Next.js app calls the public workflows at
  `/api/1.1/wf/<name>` with an admin API token. It never calls a private
  helper.
- The trip and material workflows built in phases 4, 5B and 5D are all
  already live. This phase **only adds**: new fields, two new private
  helpers, and new parameters and steps on two existing workflows. No
  existing step changes.

### Conventions

- **Public workflow:** API Workflow, *Expose as a public API workflow*
  **ticked**, authentication "User & admin".
- **Private helper:** *Expose as a public API workflow* **unticked**. This has
  been left ticked by accident before, so check each one.
- `…ID` fields are **text** holding a Bubble unique id, never a link to a
  thing. `state`, `kind` and `reason` are text, never option sets.
- Every search has *Ignore empty constraints* **off**.
- Bubble evaluates an "Only when" condition **strictly left to right**, with no
  precedence: `A or B and C` means `(A or B) and C`. The order of the terms
  below is deliberate.
- Each step's condition is checked **when Bubble reaches that step**, so a step
  sees what earlier steps in the same run already wrote. That is why every
  state flip below is the **last** step.

### Types this phase touches

`tripmaterial`: one material line on one trip. Fields: `tripID`, `lineID`,
`requestID`, `materialID`, `name`, `unit`, `kind` (`Inventory` /
`NonInventory`), `qty`, `actualQty`, `fromStopKey`, `fromLocation`,
`toStopKey`, `toLocation`, `state`.

`state` goes `Planned` → `Loaded` → `Dropped`, or one of these:

- `Skipped`: not collected;
- `Refused`: turned away at the drop and still on the truck;
- `Returned`: a refused row, unloaded at the yard.

`requestedmaterials` (appears in the editor as **`requestedMaterials`**): one
material line on a request. Fields include `requestID`, `kind`, `materialID`,
`name`, `unit`, `quantity`, `assignedQty`, `materials`, `jobType`.

`materialitem`: the catalogue. `stockQty` is the warehouse stock.

`materialsitestock`: material delivered to a job site and not picked up. Fields:
`materialID`, `materialName`, `unit`, `location` (the job **name**), `qty`.

`materialstockhistory`: the audit row for every stock change. Fields:
`materialID`, `materialName`, `delta`, `stockAfter`, `reason`, `location`
(empty = warehouse), `requestID`, `tripID`, `byName`.

### Existing helper reused: `adjust-site-stock` (private, built in 5D)

The only writer of `materialsitestock`. This phase schedules it from a new
helper. Its parameters:

| Parameter | Type |
| --- | --- |
| `materialId`, `name`, `unit`, `location`, `reason`, `requestId`, `tripId`, `byName` | text |
| `delta` | number (signed) |
| `floorAtZero` | yes/no |
| `siteRow` | `materialsitestock`. The **caller** searches and passes `:first item`. Empty = no row yet |

With `floorAtZero = yes` and a negative `delta`, it creates a row at `qty 0`
when the site has none, and never takes `qty` below 0. It always writes one
`materialstockhistory` row. **It is not idempotent on its own.** It's safe
only because every caller is gated on a `tripmaterial` state that the caller
flips afterwards.

### What a material pickup is

A PM asks for material to come **back** from a job site. The PM's quantity is
an estimate. At the collect stop the driver **counts** what they actually took:

- That count comes **off the site's figure** (`materialsitestock`), floored at
  0.
- When the truck unloads at the warehouse, an inventory line adds that count
  to `materialitem.stockQty`.

A pickup line can also be linked to a delivery line at another site (a
**transfer**). It then drops at that site instead of the warehouse. The drop
uses the existing 5D drop step, which credits the receiving site with the
row's `actualQty`.

---

## Step 1 — Three new fields on `requestedmaterials` (task 0)

Data tab → `requestedMaterials` → add three fields, all **text**:

| Field | Meaning |
| --- | --- |
| `transferToLineID` | On a **pickup** line only: the unique id of the delivery line it feeds. Empty = goes to a warehouse |
| `transferToRequestID` | That delivery line's `requestID` |
| `transferToLocation` | That delivery request's `job` name, the trip destination. A snapshot |

- They stay empty on every existing row. No backfill.
- **No workflow reads or writes them.** Next.js writes them with a plain Data
  API `PATCH`.
- Update the type's description, which says the lines are never recreated, to
  also mention the three transfer fields. For example: *"Lines are updated in
  place, never recreated. transferTo… fields are written only by Next.js (Data
  API PATCH)."*
- **Settings → API:** `requestedmaterials` should already be ticked under
  *Enable Data API*, because Next.js reads it today. Confirm it is still ticked.

**Check:**

- `GET /api/1.1/obj/requestedmaterials?limit=3` returns rows as before. The new
  fields are absent or empty.
- `GET /api/1.1/meta/swagger.json` lists all three fields under
  `requestedmaterials`, typed `string`.

---

## Step 2 — `new-pickup-request` gains `materialLines` (task 1)

This copies onto `new-pickup-request` what `new-request` already does. **Open
`new-request` side by side and copy its materials step**: it is the working
reference.

### 2a. New parameter

- **`materialLines`**: type **text**, **is a list** ticked, optional. Not an
  object list or a `requestedmaterials` list. 5B tried that and every call
  failed with `object with this id does not exist`.

Each item is one material line, its fields joined by `::`, in this fixed order:

```
kind::materialID::name::unit::quantity::materials
```

Example value:

```json
["Inventory::1758…x2::Acetone::gal::10::Acetone: 10 gal", "NonInventory::::Rags::::2::Rags: 2"]
```

`materialID` and `unit` are empty when a line has none. `quantity` is empty for
a lot with no number.

### 2b. New step

**Schedule API Workflow on a list** → the existing private helper
`create-requested-material`:

- Type of things: **text**. List to run on: `materialLines`.
- Only when: `materialLines:count > 0`.
- Scheduled date: Current date/time.
- Parameter mapping. Copy it from `new-request`. Field numbers are 1-based:

| `create-requested-material` param | Value |
| --- | --- |
| `requestId` | *Result of step N*'s unique id, where N is the step that creates the `request` row |
| `jobType` | `todo` (the workflow's job-type parameter, as `new-request` passes it) |
| `kind` | `This text:split by ("::"):item #1` |
| `materialId` | `This text:split by ("::"):item #2` |
| `name` | `This text:split by ("::"):item #3` |
| `unit` | `This text:split by ("::"):item #4` |
| `quantity` | `This text:split by ("::"):item #5:converted to number` |
| `materials` | `This text:split by ("::"):item #6` |

*Result of step N* is safe here: the create step in `new-pickup-request` is
unconditional, so it always has a result (`phase-4-trips.md`, "As built").

Place it **after** the step that creates the `request`, anywhere before the
*Return data* step.

### 2c. Return data

Add one key: **`materialLines`** = `materialLines:count` (number).

### Leave these alone

- **The `status = "Assigned"` on the create step.** It is right for a pickup
  that names tools. For a materials-only pickup it is premature, and Next.js
  corrects it to `New` right after the create.
- **Any existing step that writes a `requestedmaterials` row from the
  `materials` text** (the "legacy row"). Next.js sends the lines' summary as
  `materials`, so a pickup with lines also gets one legacy row. Next.js already
  hides a legacy row whenever structured lines exist. If you're unsure whether
  this step exists, read it and note the answer under "Built as".

**Check** (one real write; use a test job and note the request id):

- Call `new-pickup-request` from Postman with the same body Next.js sends
  today, plus `"materialLines": ["NonInventory::::Test rags::::2::Test rags: 2"]`.
- The response has `"materialLines": 1`.
- Then `GET /obj/requestedmaterials?constraints=[{"key":"requestID","constraint_type":"equals","value":"<id>"}]`:
  - one row with `kind = NonInventory`, `name = Test rags`, `quantity = 2`,
    `assignedQty = 0`;
  - plus a legacy row with empty `kind`, if the legacy step exists.
- Call it once **without** `materialLines`. It behaves exactly as before, and
  `materialLines` comes back `0`.

---

## Step 3 — New private helper `load-trip-material` (task 2)

This records the driver's count at a pickup's collect stop, and takes that
count off the site.

**Backend workflows → New API workflow** `load-trip-material`. *Expose as a
public API workflow*: **unticked**.

| Parameter | Type |
| --- | --- |
| `tripMaterial` | `tripmaterial` |
| `actualQty` | number |
| `byName` | text |

Call the row *T* (= `tripMaterial`). **Every step is conditioned on `T's state
is "Planned"`**, and the flip is last. A replay finds `Loaded` and does nothing.

| # | Action | Only when |
| --- | --- | --- |
| 1 | **Schedule API Workflow** `adjust-site-stock`, scheduled now. Mapping below | `T's state is "Planned" and T's kind is "Inventory" and actualQty > 0` |
| 2 | **Make changes to a thing** *T*: `actualQty = actualQty`, `state = "Loaded"` | `T's state is "Planned"` |

Step 1 mapping:

| `adjust-site-stock` param | Value |
| --- | --- |
| `materialId` | `T's materialID` |
| `name` | `T's name` |
| `unit` | `T's unit` |
| `location` | **`T's fromLocation`**: the job it was collected from |
| `delta` | **`actualQty * -1`** |
| `floorAtZero` | **yes** |
| `reason` | `Collect` |
| `requestId` | `T's requestID` |
| `tripId` | `T's tripID` |
| `byName` | `byName` |
| `siteRow` | `Search for materialsitestocks (materialID = T's materialID, location = T's fromLocation)`, sorted by **Created Date ascending**, `:first item` |

Notes:

- `siteRow`: copy the search from `drop-material-at-site`'s step 1, but use
  **`fromLocation`** instead of `toLocation`.
- Step 1 is **Schedule API Workflow**, not a direct action, because
  `adjust-site-stock` is its own workflow.
- A non-inventory row, or a count of 0, flips to `Loaded` with no site write.
  Next.js never sends a count of 0 here. It sends 0 as a skip instead. The
  `actualQty > 0` condition is a second guard.

---

## Step 4 — New private helper `land-material-stock` (task 2)

This unloads a pickup row at the warehouse: an inventory line adds its count
to stock.

**New API workflow** `land-material-stock`. *Expose as a public API workflow*:
**unticked**. It has the same shape as the existing `return-material-stock`,
so open that one beside it.

| Parameter | Type |
| --- | --- |
| `tripMaterial` | `tripmaterial` |
| `byName` | text |

Call the row *T*. The gate is `T's state is "Loaded"` **or** `"Refused"`. A
`Refused` row is a transfer that the receiving site turned away, and it rode on
to the yard.

| # | Action | Only when |
| --- | --- | --- |
| 1 | **Make changes to a thing** `Search for materialitems (unique id = T's materialID):first item`: `stockQty = This materialitem's stockQty + T's actualQty` | `T's state is "Loaded" or T's state is "Refused" and T's kind is "Inventory" and T's actualQty > 0` |
| 2 | **Create a new materialstockhistory**. Field values below | `Result of step 1 is not empty` |
| 3 | **Make changes to a thing** *T*: `state = "Dropped"` | `T's state is "Loaded"` |
| 4 | **Make changes to a thing** *T*: `state = "Returned"` | `T's state is "Refused"` |

Step 2 field values:

| Field | Value |
| --- | --- |
| `materialID` | `T's materialID` |
| `materialName` | `T's name` |
| `delta` | `T's actualQty` |
| `stockAfter` | `Result of step 1's stockQty` |
| `reason` | `Return` |
| `requestID` | `T's requestID` |
| `tripID` | `T's tripID` |
| `byName` | `byName` |
| `location` | leave empty (empty = warehouse) |

Notes:

- **Step 1's condition order matters.** Read left to right, it is `((Loaded or
  Refused) and Inventory) and count > 0`. If `or` is moved to the end, a
  non-inventory `Refused` row would add to stock.
- **Steps 3 and 4 have opposite conditions, so exactly one runs.** After step 3
  the row reads `Dropped`, which step 4's condition rejects. Keep 3 before 4.
- **No `assignedQty` step.** Unlike `return-material-stock`, a pickup line
  never held stock, so there is nothing to release.
- `delta` and `stockAfter` use **`actualQty`** (the driver's count), never
  `qty` (the estimate).
- A replay finds `Dropped` or `Returned`, so every step's condition fails and
  nothing runs.

---

## Step 5 — `complete-trip-stop` gains two lists (task 2)

Public, existing, manual parameters. Its trigger is gated on the trip being
`In Transit`, so leave that alone. **No existing step changes.**

### 5a. New parameters

Both are optional:

| Parameter | Type |
| --- | --- |
| `countMaterials` | text, **is a list**. Each item is `lineId::actualQty`, e.g. `"1759…x7::7"` |
| `landMaterialIds` | text, **is a list**. Line ids (`tripmaterial.lineID`), like the other material lists |

### 5b. New steps

Add both after the existing material steps (the current steps 10–14) and before
*Return data*:

| # | Step | Only when |
| --- | --- | --- |
| A | **Schedule API Workflow on a list** → `load-trip-material`. Mapping below | `countMaterials:count > 0` |
| B | **Schedule API Workflow on a list** → `land-material-stock`. Mapping below | `landMaterialIds:count > 0` |

Step A mapping:

- Type of things: **text**. List: `countMaterials`.
- `tripMaterial` = `Search for tripmaterials (tripID = tripId, lineID = This
  text:split by ("::"):item #1):first item`.
- `actualQty` = `This text:split by ("::"):item #2:converted to number`.
- `byName` = the same expression the existing material steps 13–14 pass as
  `byName`.

Step B mapping:

- Type of things: **tripmaterial**. List: `Search for tripmaterials (tripID =
  tripId, lineID is in landMaterialIds)`. **No `state` constraint**: see
  deviation 2 at the top.
- `tripMaterial` = `This tripmaterial`.
- `byName` = as in step A.

**Check each search's list parameter against its own step.** The 5D build had
step 13 searching `loadMaterialIds` instead of `dropMaterialIds`, and nothing
showed it except a settle warning. Step A's search uses `countMaterials` and
step B's uses `landMaterialIds`.

### 5c. Return data

Add two number keys:

- `materialsCounted` = `countMaterials:count`
- `materialsLanded` = `landMaterialIds:count`

Both are counts of the list **sent**, as all the other keys are. The work is
asynchronous, and Next.js settle-polls the rows afterwards.

### Nothing else needed for transfers

- A transfer dropped at the receiving site goes in the existing
  `dropMaterialIds`. `drop-material-at-site` already credits `T's toLocation`
  with `T's actualQty`, which on a pickup row is the driver's count.
- A transfer turned away there goes in the existing `refuseMaterialIds`
  (`Loaded` → `Refused`).
- Its unload at the yard goes in `landMaterialIds` (step B).

---

## Step 6 — Static checks before handing back

These need no data:

1. `load-trip-material` and `land-material-stock` both show *Expose as a public
   API workflow* **unticked**.
2. Swagger (`/meta/swagger.json`) does **not** list either helper under `/wf/`.
   It **does** list `complete-trip-stop` with `countMaterials` and
   `landMaterialIds`, and `new-pickup-request` with `materialLines`.
3. In `load-trip-material`, step 2 (the flip) is last. In `land-material-stock`,
   steps 3 and 4 come after 1 and 2.
4. Every new search has *Ignore empty constraints* off.
5. In `complete-trip-stop`, an old body with neither new list still returns 200,
   and `materialsCounted` and `materialsLanded` come back `0`.

The live tests (counts, site debit, stock landing, replays) run from the app
once the Next.js half is in. They are in `phase-5f-pickup-backend.md`'s
Verification list. Include a **"more than half" collect** (5 on site, collect
3, expect 2), per the fix note at the top of `phase-5d-bubble-handoff.md`.

---

## API contract Next.js is written against

### `new-pickup-request`

- **Body gains:** `materialLines: string[]` (`kind::materialID::name::unit::quantity::materials`).
  It is left out entirely when there are no lines.
- **Response gains:** `materialLines` (number).

### `complete-trip-stop`

- **Body gains:**
  - `countMaterials: string[]` (`lineId::actualQty`, `actualQty` a whole
    number ≥ 1);
  - `landMaterialIds: string[]` (line ids).
- **Response gains:** `materialsCounted`, `materialsLanded` (numbers, each the
  `:count` of its list). Next.js reads a missing key as 0. It only throws when
  the key is missing and its list was not empty.

### Private, never called from Next.js

`load-trip-material`, `land-material-stock`, and the existing
`adjust-site-stock`, `create-requested-material`.

### Data API `PATCH` from Next.js

`PATCH /obj/requestedmaterials/<id>` with
`{ transferToLineID, transferToRequestID, transferToLocation }`. Linking sets
all three. Unlinking sets all three to `""`.

---

## Built as (2026-10-01)

Built by the user in Studio, following this sheet step by step. Checked
against the API contract above: **no deviations.** Not yet tested live.

- **Step 1:** all three fields were added as text (not lists). Swagger lists
  them as `string`. *Enable Data API* is still ticked.
- **Step 2:**
  - `requestId` = *Result of step 1* (Create a new request). The helper's
    parameter is spelled `materialID` in Studio, as in `new-request`.
  - **`new-pickup-request` does have a legacy-row step.** It was kept, so a
    pickup with lines also gets one legacy row, which `listMaterialLines`
    hides.
  - The Postman check was skipped.
- **Steps 3 and 4:** built as specified. The state flips are last. Step 1 of
  `land-material-stock` keeps the `Loaded or Refused and Inventory and > 0`
  order.
- **Step 5:** the new steps landed as **15** (`countMaterials` →
  `load-trip-material`) and **16** (`landMaterialIds` → `land-material-stock`,
  no `state` constraint).
- **Step 6:** checks 1–4 passed. For check 5, the "Only when" count conditions
  were confirmed in Studio, but an old body was **not** sent live. The first
  tools-only stop from the app covers it (verification 1).

Deploy order is satisfied: Bubble is live, so the 5F Next.js code can ship.
