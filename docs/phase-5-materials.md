# Phase 5 — materials (consumables), delivered and picked up like tools

**Start here.** This is the master design for phase 5. Each slice has its own
build doc (the index is at the bottom). Read
[`phase-4-trips.md`](./phase-4-trips.md) first: phase 5 keeps its trips, its
stops, its planner and its conventions, and adds a second kind of cargo.

| Slice | Doc | State |
| --- | --- | --- |
| 5A — schema | [`phase-5a-material-schema.md`](./phase-5a-material-schema.md) | **done** 2026-09-24 — verified live |
| 5B — delivery backend: catalogue, request, assign | [`phase-5b-delivery-backend-catalogue-assign.md`](./phase-5b-delivery-backend-catalogue-assign.md) | **done** 2026-09-24 — typecheck + `check-bubble` green; write tests not yet run |
| 5C — delivery frontend: catalogue, request, assign | [`phase-5c-delivery-frontend-catalogue-assign.md`](./phase-5c-delivery-frontend-catalogue-assign.md) | not started |
| 5D — delivery backend: trips | [`phase-5d-delivery-backend-trips.md`](./phase-5d-delivery-backend-trips.md) | not started |
| 5E — delivery frontend: trips | [`phase-5e-delivery-frontend-trips.md`](./phase-5e-delivery-frontend-trips.md) | not started |
| 5F — pickup backend | [`phase-5f-pickup-backend.md`](./phase-5f-pickup-backend.md) | not started |
| 5G — pickup frontend | [`phase-5g-pickup-frontend.md`](./phase-5g-pickup-frontend.md) | not started |

The order is fixed: schema first, backend and frontend never in the same slice,
the whole delivery flow (5B–5E) before any of the pickup flow (5F–5G). A slice's
frontend is built against the backend of the slice before it and nothing later.

## What phase 5 is for

A request's materials are a free-text memo today. The form's Materials popup
(pre-filled from the `materials` defaults per job type) sends one string, and
one `requestedmaterials` row per request holds it (`materials`, `jobType`,
`requestID` — 374 live rows at 2026-09-24, e.g. `Gravel: 15 bags / Cmp patch: 1
box / …`). Nothing is assigned, nothing rides a trip, nothing is counted.

Phase 5 makes a material request a set of **lines**, each of one of two kinds:

| Kind | Picked from | Quantity | Stock |
| --- | --- | --- | --- |
| **Inventory** | the new catalogue (`materialitem`) | required | tracked **at the warehouse only** — consumed on site, so never tracked after delivery |
| **Non-Inventory** | free text (name/description) | optional (blank = one lot) | none, anywhere. Only *requested vs delivered for this request* |

Each line then goes through the same four steps a tool does: request → assign
(warehouse manager) → trip planning → driver execution.

## Decisions settled with the user (2026-09-24)

Don't re-litigate these.

1. **The catalogue is a new table, `materialitem`.** `materials` (the per-job-type
   default text) and `consumables` (2 stray rows with `Quantity`/`QBID`) are left
   exactly as they are.
2. **The 7 consumable `toolstype` rows stay in the tool flow** (Longopac, Paint
   Trays, Extra Rollers, Extra Chip Brushes, Extra Rags, Roller Handles/Microfiber
   Wands, Steel Plate). No change to tools. Anyone who wants them stock-tracked
   adds them to the catalogue by hand.
3. **Materials ride the same trips as tools.** One `trip`, one set of
   `tripstop`s; a new `tripmaterial` row sits beside `triptool`. One driver run
   carries a site's tools and materials together.
4. **Inventory coming back to a warehouse adds to stock**, both ways it can
   happen: a pickup dropped at the yard, and a delivery refused at site and
   carried home (`Returned`).
5. **The catalogue is managed in the app** — `/materials` lists items with stock,
   adds and edits items, and adjusts stock (receive / correct). Every stock change
   is audited.
6. **Short stock means partial assign.** 20 asked, 12 in stock → 12 assigned; the
   line reads "12 of 20" and the request stays open like an unfilled tool slot.
   **Close request** is the escape hatch, as for tools.
7. **The driver ticks delivery lines and counts pickup lines.** A delivery line
   is dropped or refused whole — its quantity was fixed when the trip was
   planned. A pickup collect asks for the quantity actually taken, because nobody
   knows what's left on site; `0` means not collected.
8. **The structured picker replaces the free-text popup** on every request form.
   Legacy rows still show on the request page as "Materials (legacy note)",
   read-only, and never enter assignment or trips.

## Calls made in planning — override here if wrong

- **No site-to-site transfer for materials.** See the section below.
- **A pickup line is done once it has one `Dropped` trip row**, whatever quantity
  the driver counted. Site quantity is unknown, so the driver's count is the
  truth, not the PM's estimate. A collect with `actualQty = 0` is `Skipped` and
  the line stays outstanding.
- **Quantities are positive whole numbers.** The unit (`bag`, `box`, `gal`)
  carries the meaning. A non-inventory line with no quantity is **one lot** —
  stored blank, counted as `1` in progress maths, shown as "—".
- **Material pickups get an approve step** (no stock involved), because the brief
  says assignment mirrors delivery. Tool pickups skip it (born `Assigned`); a
  request carrying both reads by the usual status derivation.
- **The legacy `materials` text is still sent**, now as a formatted summary of
  the lines, so the old Bubble UI keeps its one readable row per request. The
  reader here hides a request's legacy row whenever that request has structured
  lines, so nothing is shown twice.

---

## Schema

Full field lists and build steps in
[`phase-5a-material-schema.md`](./phase-5a-material-schema.md). House rules
apply unchanged: ids are **text holding another row's `_id`, never Bubble
links**; statuses and kinds are **text, never option sets**, so a bad value fails
loudly in Zod rather than silently on write.

| Type | New? | One row per | Role |
| --- | --- | --- | --- |
| `materialitem` | new | catalogue item | name, unit, **`stockQty`**, category, `active` |
| `materialstockhistory` | new | stock change | the audit trail — every `+`/`−` on `stockQty`, with a reason |
| `requestedmaterials` | **extended** | **line** (new rows) | demand **and** allocation: `quantity` asked, `assignedQty` given |
| `tripmaterial` | new | line **per trip** | the movement: `qty` planned, `actualQty`, stops, `state` |

### Why there is no `assignedmaterials`

Tools need `assignedtools` because an assignment names *physical units*, several
per requested line. A material allocation is **a number on the line** — "12 of
the 20 bags" — so it lives on the line as `assignedQty`. One fewer type, and no
join to get wrong.

It also buys a **stable line id**. `create-assigned-tool` deletes and recreates
its rows on every save, which is why nothing may point at an `assignedtools`
`_id`. Material lines are **updated in place, never deleted and recreated**, so
`tripmaterial.lineID` can point at them safely. Any future workflow that
recreates `requestedmaterials` rows breaks every trip that references them —
that is a rule, not a suggestion.

### Legacy rows

A `requestedmaterials` row with an **empty `kind`** is legacy free text. It is
read, shown, and never touched. Every new line row also gets `materials =
"Name: qty unit"` so the old Bubble UI still has something to render.

---

## The stock invariant

This is the one rule every workflow in 5B, 5D and 5F exists to keep:

> **For an inventory delivery line, `assignedQty` is exactly the number of units
> taken out of `stockQty` for it and not yet given back.**

Every stock movement is paired with an `assignedQty` movement, so the two can
never drift:

| Event | `stockQty` | line `assignedQty` | history `reason` |
| --- | --- | --- | --- |
| Assign / raise allocation | `− delta` | `= target` | `Assign` |
| Unassign / lower allocation | `+ delta` | `= target` | `Unassign` |
| Delivery refused, then unloaded at the yard (`Returned`) | `+ qty` | `− qty` | `Return` |
| Close request with units never shipped | `+ unshipped` | `− unshipped` | `Release` |
| Pickup dropped at a warehouse | `+ actualQty` | — (pickup lines hold no stock) | `Return` |
| Receive / correct on `/materials` | `± delta` | — | `Receive` / `Adjust` |

Non-inventory lines skip the `stockQty` and history columns entirely — same
events, same `assignedQty` bookkeeping, no stock.

Derived from it, never stored:

- **outstanding to plan** = `assignedQty − Σ qty` over the line's trip rows in
  `Planned`/`Loaded`/`Dropped`/`Refused`
- **delivered** = `Σ qty` over `Dropped` rows
- **line done** (delivery) = delivered ≥ `quantity` (blank quantity → `1`)
- **line done** (pickup) = at least one `Dropped` row

### Retry safety

`lib/bubble/client.ts` retries a POST up to four times on 429/5xx, and Bubble has
no transactions. Three things keep a retry from moving stock twice — each
load-bearing:

1. **Assign sends a target, not a delta.** The Bubble helper computes
   `target − This line's assignedQty` itself. A retry after a commit computes `0`.
2. **Adjust stock carries an `idempotencyKey`**, gated like `create-trip`'s: a
   second call with the same key writes nothing.
3. **Every stock-changing trip helper checks the row's current `state` before
   flipping it.** A replayed `complete-trip-stop` finds the row already
   `Returned`/`Dropped` and skips it.

And **all arithmetic happens inside Bubble** — `stockQty = This materialitem's
stockQty − delta` — never read-modify-write from Next.js. That narrows, but does
not close, the window for two managers assigning the same item at the same
second. Accepted: see Known limits.

---

## Trips — what changes

Nothing about a trip's shape changes. A stop is still a location; a trip is still
a driver and an ordered list of stops. Material lines join tools in the builder's
pool, the planner, the run sheet and the PDF.

| Movement | Collect at | Drop at |
| --- | --- | --- |
| Material delivery | `Warehouse` | the request's `job` |
| Material pickup | the request's `job` | a warehouse (choosable, `WAREHOUSE_JOB_NAMES`) |

**A line can go out over several trips.** The builder offers the outstanding
quantity and lets the dispatcher lower it ("8 of the 20 today"). One
`tripmaterial` row per line per trip.

### `tripmaterial.state` — same vocabulary as `triptool.state`

| State | Delivery line | Pickup line |
| --- | --- | --- |
| `Planned` | on a draft or not reached yet | same |
| `Loaded` | in the van (`actualQty = qty`) | collected; `actualQty` = what the driver counted |
| `Dropped` | landed at the job — nothing written to stock | unloaded at the yard — **inventory `+ actualQty`** |
| `Skipped` | couldn't be loaded at the yard; still allocated, back in the pool | driver entered `0`; line stays outstanding |
| `Refused` | site turned it away; rides on to a warehouse stop | — (a warehouse never refuses) |
| `Returned` | unloaded at the yard — **inventory `+ qty`, `assignedQty − qty`** | — |

The routing of a refused row (to the next `Warehouse` stop, or a synthesised
`#return` stop) is **the tool rule, reused** — `stopWork` in
`lib/bubble/trips-types.ts` does it by state, not by key, and it now does it for
both row kinds.

## Site-to-site transfer — not supported, and why

The brief flagged this as a decision to make. The recommendation is **no**:

1. **There is no origin to take from.** A tool transfer works because the tool's
   `location` says where it is. A material has no site stock, so "10 bags from
   Job A" names nothing the system knows exists.
2. **There is no identity to collapse on.** Tool transfers work through
   `oneJourney` (`lib/trips/movement-types.ts`) merging a pickup leg and a
   delivery leg *for the same physical tool id*. Two material lines on two
   requests share nothing to merge on.
3. **Stock arithmetic assumes a warehouse at one end.** Every row in the invariant
   table above starts or ends at the yard.

Workaround, which already works with nothing extra: a pickup at A (returns to
stock) plus a delivery to B (drawn from stock). The extension point, if it's ever
wanted: let a **pickup** line's destination be a job as well as a warehouse. Stock
stays untouched, because the material never reaches a yard. Nothing in 5A–5G
blocks that.

## Request status

`deriveRequestStatus` (`lib/trips/request-progress.ts`) keeps its seven values
and its ratchet. Material lines join the counts, so a request closes on its own
only when **every assigned tool has landed, every tool slot is filled, and every
material line is done**. A materials-only request is `New` until a line is
assigned, and goes through the same states as a tools-only one.

---

## Known limits, carried forward

- **Two managers assigning the last units of one item at the same moment** can
  both succeed, taking `stockQty` negative. Bubble's server-side arithmetic
  narrows the window; nothing closes it without transactions. `/materials` flags
  a negative stock level in red, and a stock `Adjust` corrects it.
- **The old Bubble UI renders only the first row** it finds per request, so it
  shows one line of a multi-line material request — or the legacy summary row,
  which `new-request` writes whenever a request has materials (5B, §1.4). Not
  fixed; that UI isn't this repo's.
- **No roles** — same as the tool flow. Anyone signed in can adjust stock.
- **Legacy free-text rows are never migrated.** Parsing `Gravel: 15 bags` into a
  catalogue line is exactly the fragile inference this phase avoids.
- **A trip can't be edited once started** — unchanged from phase 4.
