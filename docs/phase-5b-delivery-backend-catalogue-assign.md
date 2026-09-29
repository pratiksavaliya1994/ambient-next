# Phase 5B — delivery backend: catalogue, request lines, assignment

Part of [phase 5](./phase-5-materials.md). Needs [5A](./phase-5a-material-schema.md)
built. **Backend only**: Bubble workflows, `lib/`, server actions, schemas. No
page or component changes — those are [5C](./phase-5c-delivery-frontend-catalogue-assign.md),
built against this.

## Goal

Everything a delivery's material lines need **before** a trip:

1. The catalogue can be created, edited and stocked, with every stock change
   audited.
2. A delivery request can be created with structured material lines.
3. A warehouse manager can assign lines — inventory draws stock, partial allowed;
   non-inventory is approved — and unassign.
4. Close request gives back stock that never left the yard.
5. `request.status` counts material lines.

## Scope

**In:** `adjust-material-stock`, `new-request` + `materialLines`,
`assign-request-materials` + private helpers; `lib/bubble/material-items*`,
`lib/bubble/requested-materials*`, `lib/schemas/material.ts`; the request create
path (delivery form and the combined page's delivery half); `buildSummary`;
catalogue and assign server actions; `closeRequestAction`; `request-progress.ts`
and `sync-request-status.ts`; `check-bubble` read paths.

**Out:** trips (5D), pickups (5F), every screen (5C).

**Server actions count as backend.** They sit next to their route
(`app/(app)/materials/actions.ts`) the way every other action in the app does,
but they ship in this slice so 5C can wire UI to them.

---

## 1. Bubble Studio

Build and Postman-test each workflow before the Next.js code that calls it.
Follow `bubble-trip-workflows-spec.md`'s conventions: public workflows are
*API Workflow, exposed, auth "User & admin"*; private helpers have **Expose as a
public API workflow unticked** — `phase-2a-assignment-handoff.md` records it
being left ticked by accident once. Check every helper.

### 1.1 `adjust-material-stock` (public) — receive and correct

| Parameter | Type |
| --- | --- |
| `idempotencyKey` | text |
| `materialId` | text |
| `delta` | number (signed) |
| `reason` | text — `Receive` or `Adjust` |
| `byName`, `notes` | text |

Every step below carries the condition **`Search for materialstockhistory
(idempotencyKey = idempotencyKey):count is 0`** — a condition, not a Terminate,
so a retry still reaches the return step.

1. *Make changes to a thing* — `Search for materialitem (unique id =
   materialId):first item`: `stockQty = This materialitem's stockQty + delta`.
2. *Create a new materialstockhistory*: `materialID`, `materialName` (item's
   name), `delta`, `stockAfter` = step 1's result's `stockQty`, `reason`,
   `byName`, `notes`, `idempotencyKey`.
3. *Return data*: `{ "ok": true, "stockQty": <item's current stockQty> }` —
   search the item again rather than referencing step 1, which is empty on a
   retry. Same lesson as `create-trip`.

> A "correct to a count" on the screen is sent as `delta = counted − current`,
> computed by Next.js from a fresh read. The key still makes the retry safe; the
> gap between the read and the write is the accepted race in Known limits.

**Creating and editing an item needs no workflow.** It writes one row and creates
no children, the rule `/tools/new` follows: `POST /obj/materialitem` with
`stockQty = 0`, then — if the form gave an opening quantity — one
`adjust-material-stock` call with `reason = Receive`, so the opening stock is
audited like any other. Editing is a plain `PATCH`, and **the patch type excludes
`stockQty`**: stock only ever moves through a workflow.

### 1.2 `new-request` + `materialLines`

First, **read the live workflow in Studio** and record in this doc what it
currently does with the `materials` text (the 374 legacy rows were written by
something — it may already have the "create a `requestedmaterials` row" step that
`CLAUDE.md` says is missing). Whatever it does stays.

Then add, purely additively:

- **Parameter `materialLines`** — list of objects `{ kind, materialId, name,
  unit, quantity, materials }`, defined by pasting a sample payload into Detect
  Data, as `create-trip`'s `items` was. *(As built it is typed as the
  `requestedmaterials` type instead, so the key is `materialID` — see §1.4.)*
- **Schedule API Workflow on a list** → private `create-requested-material`,
  only when `materialLines is not empty`. `requestId` = the create step's
  result's unique id (safe here for the reason §"As built" in
  `phase-4-trips.md` gives for `new-pickup-request`: the create step is
  unconditional). `jobType` = `todo`.
- **Return data** gains `"materialLines": "materialLines:count"`.

An older client sends no `materialLines`; the new step gates off and the return
key is ignored by `z.looseObject`.

**`create-requested-material`** (private) — params `requestId`, `jobType`,
`kind`, `materialId`, `name`, `unit`, `quantity`, `materials`. One step: *Create
a new requestedmaterials* with those fields and `assignedQty = 0`. No return.

### 1.3 `assign-request-materials` (public) + `assign-material-line` (private)

| Parameter | Type |
| --- | --- |
| `requestId`, `byName` | text |
| `release` | yes/no — `yes` only from Close request (§3), sets the history reason |
| `lines` | list of objects `{ lineId, targetQty }`, via Detect Data |

1. *Schedule API Workflow on a list* → `assign-material-line`, list `lines`,
   passing `requestId`, `byName`, `release`.
2. *Return*: `{ "ok": true, "lines": "lines:count" }`.

**`assign-material-line`** — params `lineId`, `targetQty`, `requestId`,
`byName`, `release`. Let *L* = `Search for requestedmaterials (unique id =
lineId):first item` and *holdsStock* = `L's kind is "Inventory"` **and** `Search
for request (unique id = L's requestID):first item's pickup is no`.

**Step order is load-bearing.** Steps 1 and 2 read `L's assignedQty` *before*
step 3 overwrites it. Reorder them and every delta is zero.

1. *Make changes* to `Search for materialitem (unique id = L's materialID):first
   item`: `stockQty = stockQty − (targetQty − L's assignedQty)`.
   Only when *holdsStock* and `targetQty ≠ L's assignedQty`.
2. *Create a new materialstockhistory*: `delta = L's assignedQty − targetQty`,
   `stockAfter` = step 1's result's `stockQty`, `reason` = `Release` when
   `release`, else `Assign` when `targetQty > L's assignedQty`, else `Unassign`;
   `requestID`, `byName`. Same condition as step 1.
3. *Make changes* to *L*: `assignedQty = targetQty`.

**Why a target and not a delta:** `client.ts` retries a POST up to four times. A
delta replayed after a commit draws the stock twice; a target replayed computes
`targetQty − targetQty = 0` and writes nothing. That is the only thing making
this workflow safe to retry, so **never add a `delta` parameter to it**.

**Why *holdsStock* is computed in Bubble and not sent:** a forged POST could
otherwise approve an inventory line without drawing stock. Same reason
`new-pickup-request` reads tool names off the row rather than accepting them.

Pickup lines (5F) go through this same helper; *holdsStock* is `no` for them, so
it only sets `assignedQty`. Nothing to add later.

> **Re-plan 2026-09-28: site-to-site transfer.** A delivery line's
> `assignedQty` stays **warehouse units only**. Nothing here changes. Units
> coming from a pickup line linked to it are counted *beside* `assignedQty` as
> coverage, and `assignMaterialsAction`'s bound subtracts them. Both are built
> in [5F §2.6](./phase-5f-pickup-backend.md#26-transfers-added-2026-09-28).
> Linking a pickup line approves it through this same helper.

### 1.4 As built (2026-09-24)

Tasks 1–4 are built and confirmed working. Where this differs from §1.1–1.3,
**this section wins**.

> **Disabled 2026-09-25.** No one uses the old Bubble UI any more, so the
> user disabled the legacy-row step in `new-request`: a request created from
> now on has structured rows only. Next.js still sends the lines' summary as
> `materials` (Bubble ignores it), and `listMaterialLines` still reads the 373
> existing legacy rows. `new-pickup-request` is unchanged. The rest of this
> paragraph is the history.

**`new-request` already wrote a legacy row.** Its step 3 creates one
`requestedmaterials` row holding the raw `materials` text, with `kind`,
`materialID`, `unit`, `quantity`, `assignedQty` blank. That step runs **whether
or not `materialLines` is sent**. It is where the 373 legacy rows came from, and
it stays. It only writes a row when the request **has** materials text: 373 rows
against about 1,550 requests means requests with no materials get none.

Next.js sends the lines' summary as `materials` whenever there are lines, so a
request created from now on has:

- one legacy row (empty `kind`) when it has any materials — lines or free text —
  and none when it has neither;
- zero or more structured rows, only when `materialLines` was sent.

`listMaterialLines`' rule is unchanged and now load-bearing: **drop a request's
legacy row when it has any structured line**, else surface its text as
`legacyMaterials`. Don't try to suppress the legacy row from Next.js.

**`materialLines` is a list of texts** *(revised 2026-09-25)*. It was first
built as a list of the `requestedmaterials` type, which Bubble reads as row ids
— every real call failed with `400 Invalid data for key materialLines: object
with this id does not exist`. Detect Data would have meant moving all of
`new-request` to *Request data's …*, so it became a text list instead: one
item per line, fields joined by `::`, in this fixed order:

```
kind::materialID::name::unit::quantity::materials
["Inventory::1758…x2::Acetone::gal::1::Acetone: 1 gal", "NonInventory::::Rags::::2::Rags: 2"]
```

`materialID` and `unit` are empty when a line has none, `quantity` is empty for a
lot with none. Bubble schedules `create-requested-material` on `materialLines`
(type text) and maps each field as `This text:split by("::"):item #N`
(`quantity` also `:converted to number`); the return stays
`materialLines:count`. Next.js strips `::` and edge colons from every field so a
free-text name can't shift the columns. **Build it in
`lib/schemas/material.ts` (`toNewRequestMaterialLines`) and nowhere else.**
`adjust-material-stock` still takes `materialId`, and `assign-request-materials`'
`lines` items are still `{ lineId, targetQty }`.

Each structured row gets `jobType` = the request's `toDo` (the `todo` parameter's
value, e.g. `Grind & Level` — confirmed by the user 2026-09-24) and
`assignedQty = 0`.
The return gains `"materialLines": <count created>` — a count, not the rows;
read them with `waitForMaterialLines`.

**`adjust-material-stock` and `assign-request-materials` match §1.1 and §1.3.**
Confirmed: a retried `adjust-material-stock` with the same key returns the
current `stockQty` and writes nothing; `assign-material-line` writes no stock or
history when `targetQty` equals `assignedQty`, and always sets `assignedQty`
(pickup and non-inventory lines included). Bubble does **not** reject a partial
`targetQty` on a non-inventory line — the `0`-or-`effectiveQty` rule in §3 is
Next.js's to enforce.

---

## 2. Next.js — data layer

Line references are to the files as they stand; follow the neighbouring code's
style. **300-line cap per file** (`CLAUDE.md`) — `lib/bubble/requests.ts` is
already well past it, so material code goes in **new** modules and `requests.ts`
only calls them.

| File | New? | What |
| --- | --- | --- |
| `lib/bubble/material-items-types.ts` | new, client-safe | `MaterialItem` (`id, name, unit, stockQty, category, relatedTo, active, notes`), `itemsFor(items, toDo)` (mirrors `toolTypesFor` in `reference-types.ts`: empty `relatedTo` = all), `normaliseMaterialName` |
| `lib/bubble/material-items.ts` | new, `server-only` | `listMaterialItems({ includeInactive })`, `getMaterialItem`, `createMaterialItem`, `updateMaterialItem` (patch type **without** `stockQty`), `adjustMaterialStock`, `listStockHistory(materialId)`, `findMaterialNameClash` (the `findToolNameClash` recipe in `tool-create.ts`: `text contains` prefilter, normalised compare). **Never memoised** — stock is exactly what changes between visits, the same reason `pickup-tools.ts` isn't |
| `lib/bubble/requested-materials-types.ts` | new, client-safe | `MaterialKind`, `MaterialLine` (`id, requestId, kind, materialId, name, unit, quantity, assignedQty`), `effectiveQty(line)` (blank → 1), `formatMaterialsSummary(lines)` → `"Name: qty unit"` per line — one codec for the legacy text, the per-row `materials` field and WhatsApp |
| `lib/bubble/requested-materials.ts` | new, `server-only` | `listMaterialLines(requestIds)` → `{ lines, legacy }` from one `in` query — rows with empty `kind` go to `legacy` (reusing `parseMaterialsList` moved out of `requests.ts`), and **a request's legacy text is dropped when it has any structured line**; `assignMaterials(requestId, entries, byName, { release })`; `waitForMaterialLines(requestId, expected)` — settle poll after the async fan-outs, the `lib/trips/settle.ts` recipe |
| `lib/bubble/tripmaterial-read.ts` | new, `server-only` | `listTripMaterialsForLines(lineIds)` via `bubbleListMaybeMissing`. Returns `[]` until 5D creates rows, but the assign floor check (§3) uses it **now**, so 5D inherits a guard instead of adding one |
| `lib/schemas/material.ts` | new | `materialLineInputSchema` — discriminated union on `kind`: `Inventory` needs `materialId` + `quantity ≥ 1`; `NonInventory` needs `name` (trim, 1–200) and optional `quantity`. `materialItemSchema`, `adjustStockSchema` (`mode: "receive" \| "correct"`), `assignMaterialsSchema` (`requestId`, `lines: { lineId, targetQty ≥ 0 }[]`). Integers only. Also owns the `new-request` wire mapping `materialId` → `materialID` (§1.4) |
| `lib/schemas/request.ts` | change | Replace `materials: string` with `materialLines: z.array(materialLineInputSchema).max(50)`; the "at least one tool or materials" refine becomes "at least one tool or material line" |
| `lib/schemas/combined-request.ts` | change | Same change on the delivery half |
| `lib/bubble/requests.ts` | change | `ToolRequest.materials: string[]` → `materialLines: MaterialLine[]` + `legacyMaterials: string[]`, filled by `listMaterialLines` inside `withLines`. `createToolRequest` sends `materialLines` (with `materials` per line from the codec) **and** `materials = formatMaterialsSummary(lines)` for the legacy step. Inventory lines' `name`/`unit` are filled **server-side** from a fresh `listMaterialItems` read, never trusted from the browser |
| `lib/notify.ts` | change | `buildSummary` takes material lines and formats them with the shared codec |
| `lib/trips/request-progress.ts` | change | See §5 |
| `lib/trips/sync-request-status.ts` | change | Reads lines + their trip rows alongside `assignedtools` and passes them to `requestProgress` |
| `scripts/check-bubble.ts` | change | Read paths for `materialitem`, `materialstockhistory`, `tripmaterial`, and structured vs legacy `requestedmaterials` counts |

Every Bubble row crossing the boundary is Zod-parsed with `z.looseObject`, as the
rest of `lib/bubble/` does.

## 3. Next.js — server actions

Every action starts with `await requireSession()`, re-validates with the same
schema the form uses, and ends in `revalidatePath`. Result unions follow
`app/(app)/requests/action-state.ts`.

**`app/(app)/materials/actions.ts`** (new) + `action-state.ts`

- `checkMaterialNameAction(name)` — the debounced duplicate check, as
  `checkToolNameAction`.
- `createMaterialItemAction` — re-checks the name clash, creates with stock 0,
  then receives the opening quantity if one was given.
- `updateMaterialItemAction` — plain patch, no `stockQty`.
- `adjustStockAction` — `receive` sends `delta = +n`; `correct` re-reads the item
  and sends `delta = counted − stockQty`. Generates the `idempotencyKey` **on the
  server**, once per action call, so a client retry of the action itself is a new
  adjustment only if the person pressed the button twice.

**`app/(app)/requests/[requestId]/assign/material-actions.ts`** (new — the
route's `actions.ts` is already 11KB)

`assignMaterialsAction({ requestId, lines })`:

1. Fresh reads: the request, its lines, their items, their trip rows.
2. Per line, refuse the whole save (with the line named) if:
   - `targetQty > effectiveQty(line)` — can't assign more than asked;
   - inventory **and** `targetQty − assignedQty > item.stockQty` — "only 12 in
     stock". A **partial** target is fine; this is the partial-assign rule;
   - `targetQty <` the qty already on trip rows in `Planned`/`Loaded`/`Dropped`/
     `Refused` — can't un-assign what's on a truck or delivered. The tool
     equivalent is guard 1 in `phase-4-trips.md`'s `assignToolsAction` fix;
   - the request is closed.
3. Non-inventory lines accept only `0` or `effectiveQty(line)` — approve or
   un-approve, no stock.
4. Send only the lines whose target differs from `assignedQty`.
5. `waitForMaterialLines`, then report any line whose `assignedQty` didn't land —
   the fan-out is async and can half-fail, which is why `create-assigned-tool` is
   count-checked.
6. `syncRequestStatuses([requestId])`; a failure there is a warning, not an
   error, matching `assignToolsAction`.

**`closeRequestAction`** (`app/(app)/requests/[requestId]/actions.ts`, change)

- Refuse, as it already does for tools in transit, when any line has a trip row
  in `Planned`, `Loaded` or `Refused` — a draft trip holding units, or units on a
  truck. "Remove it from the draft trip first" / "Finish the trip first".
- Otherwise, for every **inventory delivery** line with `assignedQty >
  Σ qty(Dropped)`: call `assignMaterials` with `targetQty = Σ qty(Dropped)` and
  `release: true`. Unshipped stock goes back to the shelf, reason `Release`.
- Then write the terminal status, exactly as now. The release goes **first**: a
  closed request holding stock would be stuck holding it, because nothing
  re-opens a closed request.

**`createRequestAction`** / **`createCombinedRequestAction`** (change) — pass the
lines through; resolve inventory lines against a fresh catalogue read and refuse
an unknown or inactive `materialId`. Settle-read the created lines and warn (not
fail) if the count is short — the request row exists by then.

## 4. `request-progress.ts` — materials in the status

Additive, so every existing caller keeps compiling: `requestProgress` gains an
optional `materials: { lines, tripRows }` argument, defaulting to empty.

- `materialLines`, `materialLinesAssigned` (`assignedQty > 0`),
  `materialLinesDone` — the per-line rule from the master doc. Put the per-line
  maths in one pure `lineProgress(line, tripRows)` in
  `requested-materials-types.ts` so the assign card, the builder and the status
  all read the same numbers.
- `deriveRequestStatus`: `New` only when **no tool and no line** is assigned;
  terminal only when the tool rule holds **and** `materialLinesDone ===
  materialLines`; `landed > 0 || materialLinesDone > 0` → partial.
- The ratchet is untouched.

Until 5D, no trip rows exist, so no line is ever done and a request with
materials can close only through Close request. That is correct, not a gap.

---

## Next.js — as built (2026-09-24)

Tasks 5–14 are built; `npm run typecheck` and `npm run check-bubble` pass. Where
this differs from §2–§4:

- **The free-text `materials` field stays on both request schemas for now**,
  next to the new `materialLines` (combined: `deliveryMaterialLines`). The forms
  still use the popup until 5C, and removing the field here would have broken
  them. `new-request` gets the lines' summary as `materials` when there are
  lines, and the popup text when there aren't. **5C removes `materials`**
  from `requestFormSchema` and `deliveryMaterials` from the combined schema when
  it swaps the widget. The only component edits in 5B: `materialLines: []` /
  `deliveryMaterialLines: []` added to the two forms' `defaultValues`, and the
  two request pages now read `request.legacyMaterials` (renamed from
  `request.materials`).
- **`lib/bubble/trip-materials-types.ts` exists already**, holding only
  `TripMaterialRow`. 5D adds the stop-work halves to it.
- Added beyond the table: `listMaterialItemsByIds` (fresh stock read for assign
  and create), `getMaterialLines`, `resolveMaterialLines` (inventory lines get
  their name and unit from the catalogue; an unknown or retired item refuses the
  submit), `materialLinesWarning` (the settle-read after a create),
  `targetsLanded`, `holdsStock` (Bubble's test, mirrored), and
  `IN_MOTION_STATES`. `listMaterialLines` returns a `Map<requestId, { lines,
  legacy }>`.
- `assignMaterialsAction` returns `CreateRequestState`, the same union
  `assignToolsAction` uses. Stock is checked **per item across the whole save**,
  so two lines naming one item can't overdraw it between them.
- If Close request's release doesn't settle within the ladder, **it refuses to
  close** ("try Close again in a moment") instead of closing anyway. Retrying is
  safe because the release is a target, and closing while stock is still held
  would strand it.
- `check-bubble` read on 2026-09-24: `materialitem` 0, `materialstockhistory` 0,
  `tripmaterial` 0, `requestedmaterials` 0 structured and 373 legacy. 373 legacy
  rows against about 1,550 requests is what put the "only when there's
  materials text" rule into §1.4.

## Tasks

- [x] 1. Studio: read and record what `new-request` does with `materials` today
      (§1.4)
- [x] 2. Studio: `adjust-material-stock`; Postman: receive, then re-POST with the
      same key → stock moves once, one history row
- [x] 3. Studio: `create-requested-material` (private) + `new-request` additions
- [x] 4. Studio: `assign-request-materials` + `assign-material-line` (private);
      confirm both helpers are **not** exposed
- [x] 5. `material-items-types.ts`, `material-items.ts`
- [x] 6. `requested-materials-types.ts`, `requested-materials.ts`,
      `tripmaterial-read.ts`
- [x] 7. `lib/schemas/material.ts`; `request.ts` + `combined-request.ts` changes
- [x] 8. `requests.ts` read + create changes; `notify.ts`
- [x] 9. `app/(app)/materials/actions.ts` + `action-state.ts`
- [x] 10. `assign/material-actions.ts`
- [x] 11. `closeRequestAction` release
- [x] 12. `request-progress.ts` + `sync-request-status.ts`
- [x] 13. `check-bubble.ts` read paths
- [x] 14. `npm run typecheck` once, at the end

## Verification

Reads first, then writes on rows picked deliberately and put back.

1. `npm run check-bubble` green, including the new read paths.
2. Existing requests still render: a legacy free-text request shows its text; a
   tools-only request is unchanged. (5C shows it; here, check the parsed
   `ToolRequest` in `check-bubble` output.)
3. **Catalogue:** create one test item with opening stock 10 → `stockQty` 10 and
   exactly one `Receive` history row. Correct to 8 → one `Adjust` row, delta −2.
4. **Create:** one delivery with one inventory line (qty 5) and one
   non-inventory line (no qty) → two `requestedmaterials` rows with `kind` set,
   `assignedQty = 0`, `materials` text filled, `materialID` set on the inventory
   one — plus one legacy row holding their summary (§1.4), which the parsed
   `ToolRequest` must not show; WhatsApp message lists both.
5. **Assign partial:** assign 3 of 5 → stock 5, line `assignedQty` 3, one
   `Assign` history row with delta −3; `request.status` `Assigned`.
   **Re-send the identical call from Postman → nothing changes.** This is the
   retry test and the most important one on the page.
6. Assign 5 → stock 3; lower to 2 → stock 6, reason `Unassign`.
7. Try to assign more than stock → refused by name, nothing written.
8. **Close request** on it → stock back to 8, reason `Release`, line
   `assignedQty` 0, status `Delivered`.
9. Retire the test item (`active = no`) rather than deleting it.
