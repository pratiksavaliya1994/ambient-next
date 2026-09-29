# Phase 5A — material schema (Bubble Studio)

Part of [phase 5](./phase-5-materials.md). **Schema only**: three new types and
six new fields on one existing type. No workflows, no Next.js code, no data
written. Workflows come in 5B, 5D and 5F, next to the code that calls them.

> **Later schema (re-plan 2026-09-28).** This slice stays done as built. Two
> more schema additions come with the slices that first need them:
> - [5D §1.0](./phase-5d-delivery-backend-trips.md#10-schema-additions-added-2026-09-28):
>   the `materialsitestock` table and `materialstockhistory.location`;
> - [5F §1.0](./phase-5f-pickup-backend.md#10-schema-additions-added-2026-09-28):
>   `requestedmaterials.transferToLineID` / `transferToRequestID` /
>   `transferToLocation`.

> The `version-test` branch is the only version in use. Treat it as production.
> Adding a type or a field is safe; **renaming, retyping or deleting one is not**,
> and nothing here does either.

## Goal

After this slice, every table the material flow needs exists and returns an
empty list over the Data API, and `meta/swagger.json` shows the new fields. No
screen changes.

## Scope

**In:** `materialitem`, `materialstockhistory`, `tripmaterial` (new);
`requestedmaterials` (six added fields); privacy rules; Data API exposure;
read-only verification.

**Out:** every workflow; `materials`, `consumables`, `toolstype`, `triptool` —
untouched.

## Conventions — read before building

- Field names are **case-sensitive** and the Next.js side will match them exactly.
- Every `…ID` field is **text holding another row's unique id**, not a Bubble
  link — the house pattern (`requestedtools.requestID`, `triptool.toolID`). Don't
  "improve" them into links; every join is done in JS.
- `kind`, `state` and `reason` are **text, not option sets**, the call
  `request.status` and `trip.status` already made.
- Numbers are Bubble **number** type. Quantities are whole numbers by
  convention; Bubble doesn't enforce it, Zod will.

---

## 1. `materialitem` (new) — the inventory catalogue

| Field | Type | Notes |
| --- | --- | --- |
| `name` | text | The identifier people see. Not unique in Bubble; the app guards duplicates the way `findToolNameClash` does for tools |
| `unit` | text | `bag`, `box`, `gal`, `roll`, `each` … free text |
| `stockQty` | number | Units at the warehouse. **Only ever written by workflows** (5B, 5D, 5F) — never by a Data API `PATCH` |
| `category` | text | Optional grouping for the catalogue screen |
| `relatedTo` | **list of** `ToDo` option set | Optional. Which job types the item is offered for; empty = all. Spelled correctly — it is a new field, unlike `toolstype.realtedTo` |
| `active` | yes/no | Default **yes**. Soft delete: lines point at items by id, so an item is retired, never deleted |
| `notes` | text | |

## 2. `materialstockhistory` (new) — the stock audit trail

One row per change to a `materialitem.stockQty`. Written only inside the
workflows that change stock, in the same run.

| Field | Type | Notes |
| --- | --- | --- |
| `materialID` | text | `materialitem` unique id |
| `materialName` | text | Snapshot, so history reads after a rename |
| `delta` | number | Signed. `-12` on assign, `+5` on a return |
| `stockAfter` | number | `stockQty` after this change |
| `reason` | text | `Receive` · `Adjust` · `Assign` · `Unassign` · `Return` · `Release` |
| `requestID` | text | Empty for `Receive`/`Adjust` |
| `tripID` | text | Set only for trip-driven `Return` |
| `byName` | text | The signed-in person's name from the session. **`Created By` is the API token's owner, not the person** (see `CLAUDE.md`) |
| `idempotencyKey` | text | Set by `adjust-material-stock` (5B) so a retried receive doesn't double-count |
| `notes` | text | Free text on a manual adjust ("recount 9/24") |

## 3. `requestedmaterials` (extend) — one row per line

Existing fields stay exactly as they are: `requestID`, `jobType`, `materials`.
Add:

| Field | Type | Notes |
| --- | --- | --- |
| `kind` | text | `Inventory` · `NonInventory`. **Empty means a legacy free-text row** — the 374 existing rows, and any the legacy workflow step keeps writing |
| `materialID` | text | `materialitem` unique id. Empty for `NonInventory` |
| `name` | text | Snapshot of the item name, or the free-text description |
| `unit` | text | Copied from the item, or typed for non-inventory |
| `quantity` | number | Asked for. Blank allowed on `NonInventory` (= one lot) |
| `assignedQty` | number | Allocated by the warehouse manager. Blank/0 = not yet assigned. For inventory delivery lines this *is* the units held out of stock — see the invariant in the master doc |

> **A line row is never deleted and recreated.** `tripmaterial.lineID` points at
> its unique id. Write that into the type's description in Studio so whoever
> builds the next workflow sees it.

## 4. `tripmaterial` (new) — a line on a trip

The material twin of `triptool`. One row per line per trip.

| Field | Type | Notes |
| --- | --- | --- |
| `tripID` | text | |
| `requestID` | text | |
| `lineID` | text | `requestedmaterials` unique id |
| `materialID` | text | Empty for non-inventory |
| `name`, `unit`, `kind` | text | Snapshots, so the run sheet renders without re-reading the line |
| `qty` | number | Planned for this trip |
| `actualQty` | number | Set on load. Delivery: `= qty`. Pickup: what the driver counted |
| `fromStopKey`, `fromLocation` | text | Same meaning as on `triptool` |
| `toStopKey`, `toLocation` | text | |
| `state` | text | `Planned` · `Loaded` · `Dropped` · `Skipped` · `Refused` · `Returned` |

## 5. Privacy and API exposure

- Copy **privacy rules** from `assignedtools` onto all three new types, the same
  way `assignedtools` copied them from `requestedtools`.
- In *Settings → API*, tick **Enable Data API** for `materialitem`,
  `materialstockhistory` and `tripmaterial`. `requestedmaterials` is already
  exposed.

---

## Tasks

**Done 2026-09-24.** Checks 1–3 were run live over the Data API: all three new
types return an empty `results`, the legacy `requestedmaterials` rows (373) come
back with only `materials`/`requestID`/`jobType`, and Swagger lists every field
with the type above. The `active` default, the `ToDo` option set on `relatedTo`,
privacy rules, the description note and check 4 were confirmed in Studio and the
old UI.

- [x] 1. Create `materialitem` with the §1 fields; `active` defaults to yes
- [x] 2. Create `materialstockhistory` with the §2 fields
- [x] 3. Add the six §3 fields to `requestedmaterials`; add the "never recreated"
      note to its description
- [x] 4. Create `tripmaterial` with the §4 fields
- [x] 5. Privacy rules on the three new types, copied from `assignedtools`
- [x] 6. Data API exposure for the three new types
- [x] 7. Verification below, then mark 5A done in the master doc's table

## Verification — all reads

1. Each returns `{"response":{"results":[], …}}`, **not a 404**:

   ```
   GET /obj/materialitem   GET /obj/materialstockhistory   GET /obj/tripmaterial
   ```

   A 404 means a wrong type name or a missed API tick — and the Next.js reader
   (`bubbleListMaybeMissing`) would hide that forever as "no rows yet". This is
   the check that matters.
2. `GET /obj/requestedmaterials?limit=3` still returns the legacy rows unchanged,
   with the new fields simply absent.
3. `GET /meta/swagger.json` lists every field above with the right type
   (`stockQty`, `delta`, `stockAfter`, `quantity`, `assignedQty`, `qty`,
   `actualQty` as number; `relatedTo` as an array of option set).
4. The old Bubble UI still opens a request that has materials — adding fields
   must not have broken its page.
