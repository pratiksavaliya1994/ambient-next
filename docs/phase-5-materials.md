# Phase 5 — materials (consumables), delivered and picked up like tools

**Start here.** This is the master design for phase 5. Each slice has its own
build doc (the index is at the bottom). Read
[`phase-4-trips.md`](./phase-4-trips.md) first: phase 5 keeps its trips, its
stops, its planner and its conventions, and adds a second kind of cargo.

| Slice | Doc | State |
| --- | --- | --- |
| 5A — schema | [`phase-5a-material-schema.md`](./phase-5a-material-schema.md) | **done** 2026-09-24 — verified live |
| 5B — delivery backend: catalogue, request, assign | [`phase-5b-delivery-backend-catalogue-assign.md`](./phase-5b-delivery-backend-catalogue-assign.md) | **done** 2026-09-24 — typecheck + `check-bubble` green; write tests not yet run |
| 5C — delivery frontend: catalogue, request, assign | [`phase-5c-delivery-frontend-catalogue-assign.md`](./phase-5c-delivery-frontend-catalogue-assign.md) | **built** 2026-09-25 — typecheck clean, awaiting the browser pass |
| 5D — delivery backend: trips **+ site stock** | [`phase-5d-delivery-backend-trips.md`](./phase-5d-delivery-backend-trips.md) | **built** 2026-09-28 — both halves; not run live |
| 5E — delivery frontend: trips **+ site view** | [`phase-5e-delivery-frontend-trips.md`](./phase-5e-delivery-frontend-trips.md) | **built** 2026-09-29 — typecheck clean, awaiting the browser pass |
| 5F — pickup backend **+ site-to-site transfer** | [`phase-5f-pickup-backend.md`](./phase-5f-pickup-backend.md) | **built** 2026-10-01 — both halves; not run live |
| 5G — pickup frontend **+ transfer UI** | [`phase-5g-pickup-frontend.md`](./phase-5g-pickup-frontend.md) | **built** 2026-10-05 — typecheck clean, awaiting the browser pass; no backend change required |

The order is fixed: schema first, backend and frontend never in the same slice,
the whole delivery flow (5B–5E) before any of the pickup flow (5F–5G). A slice's
frontend is built against the backend of the slice before it and nothing later.

> **Re-planned 2026-09-28** for two client requests: **material at job sites**
> (a "By site" view) and **site-to-site material transfer**. 5A–5C are
> untouched. The new schema lands in the slice that first needs it, as 5A's
> workflows did: the site stock table in 5D, the transfer fields in 5F. The
> slices kept their letters because code comments already refer to them. See
> [Site stock](#site-stock) and [Site-to-site transfer](#site-to-site-transfer).

## What phase 5 is for

A request's materials are a free-text memo today. The form's Materials popup
(pre-filled from the `materials` defaults per job type) sends one string, and
one `requestedmaterials` row per request holds it (`materials`, `jobType`,
`requestID` — 374 live rows at 2026-09-24, e.g. `Gravel: 15 bags / Cmp patch: 1
box / …`). Nothing is assigned, nothing rides a trip, nothing is counted.

Phase 5 makes a material request a set of **lines**, each of one of two kinds:

| Kind | Picked from | Quantity | Stock |
| --- | --- | --- | --- |
| **Inventory** | the new catalogue (`materialitem`) | required | tracked **at the warehouse** (`stockQty`), and **at each job site** as *delivered − picked up* (`materialsitestock`, from 5D). Use on site is not tracked |
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

## Decisions settled with the user (2026-09-28) — the client's re-plan

9. **Site stock is *delivered − picked up*, nothing else.** Use on site is not
   tracked. There is no manual "record usage" or "recount" at a site. The figure
   is labelled **"Delivered, not picked up"**, never "on site", because it is an
   upper bound.
10. **Site material shows in a new "By site" view under Materials**
    (`/materials/sites`, Job Dashboard layout). There is also a per-site page,
    and a "where it is" card on the item page.
11. **Site-to-site transfer is decided at assignment.** A PM raises an ordinary
    pickup at Site A. On a **delivery's** assign page at Site B, the open pickup
    lines for the same item at other sites are listed, and the warehouse manager
    can **link** one to B's line. A pickup line nobody links goes to the
    warehouse, as before. The trip plan follows the link.
12. **Inventory lines only.** Non-inventory lines get no site quantity and are
    never transfer sources, because they have no identity to add up or match on.

## Calls made in planning — override here if wrong

- **A pickup line is done once it has one `Dropped` or `Returned` trip row**,
  whatever quantity the driver counted. `Returned` is a refused transfer that
  ended up at the yard. The driver's count is the truth, not the PM's estimate
  and not the site figure. A collect with `actualQty = 0` is `Skipped` and the
  line stays outstanding.
  - **Amended by the user 2026-10-06: an unlinked pickup line can be split
    across trips.** The builder has a stepper for it, like a delivery line.
    Each live or finished trip row **claims** `max(qty, actualQty)` of the
    estimate: its plan, or the driver's count when that is more. A count below
    the plan gives nothing back. What no row claims stays in the pool. The
    line is done when no trip holds it and the claims cover the estimate. So
    a line planned whole is still done by its one row, whatever was counted,
    and rows written before this change read exactly as they did. **Linked
    transfers stay whole-line.** A line that any trip has planned or collected
    part of can't be linked. The rule lives in `pickupClaims`
    (`requested-materials-types.ts`). No Bubble change was needed, because
    `complete-trip-stop` already works one row per line per trip.
- **A transfer is whole-line.** A pickup line has exactly one destination: the
  warehouse, or one delivery line at another site. If more comes back than B
  needed, the extra stays in B's site stock.
- **A site collect floors at 0.** Counting 10 at a site that reads 6 leaves 0,
  not −4.
- **Quantities are positive whole numbers.** The unit (`bag`, `box`, `gal`)
  carries the meaning. A non-inventory line with no quantity is **one lot** —
  stored blank, counted as `1` in progress maths, shown as "—".
- ~~Material pickups get an approve step~~ — **overturned by the user
  2026-10-05.** Pickup material lines need **no approval**, the same as a
  pickup's tools: they count as assigned in full from the moment the request is
  created (`lineProgress`'s pickup branch), and go straight into the trip
  pool. `assignedQty` stays 0 on pickup lines and is never read for them. A
  pickup is born `Assigned`, whatever it carries.
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
| `materialsitestock` | new (**5D**) | item **per job site** | `qty` delivered and not picked up. The warehouse is **not** a row here; it stays `materialitem.stockQty` |
| `materialstockhistory` | + `location` (**5D**) | | empty = warehouse, else the job name. Two new reasons: `Deliver`, `Collect` |
| `requestedmaterials` | + `transferToLineID`, `transferToRequestID`, `transferToLocation` (**5F**) | | set on a **pickup** line linked to a delivery line at another site |

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

**The invariant is unchanged by the 2026-09-28 re-plan.** A delivery line's
`assignedQty` is still warehouse units only. Units coming by transfer are
counted beside it (see [Site-to-site transfer](#site-to-site-transfer)), never
in it. A transfer never touches `stockQty` at all.

---

## Site stock

What a job site has been sent and hasn't sent back, per catalogue item. It is
built in 5D (table, writes on delivery drops, reads) and 5F (writes on pickup
collects), and shown in 5E.

- **`materialsitestock`**: one row per item per site. Fields: `materialID`,
  `materialName`, `unit`, `location` and `qty`. `location` is the job **name**,
  exactly as `request.job` and `tools.location` hold it. It is never a warehouse
  name: the warehouse stays on `materialitem.stockQty`, so nothing built in 5B
  changes. Bubble's `Modified Date` is "last moved".
- **Only workflows write it.** Every change also writes a
  `materialstockhistory` row with `location` set, so one audit trail covers the
  warehouse and every site. `stockAfter` is **that location's** quantity.
- **Inventory only**, by decision 12.

| Event | Warehouse `stockQty` | Site `qty` | history `reason` |
| --- | --- | --- | --- |
| Inventory delivery row dropped at job X | — | X `+ qty` | `Deliver` |
| Inventory pickup row counted at X (`c > 0`) | — | X `− c`, floored at 0 | `Collect` |
| Transfer row (pickup from A, linked to B) dropped at B | — | B `+ actualQty` | `Deliver` |
| Pickup row unloaded at the yard, a refused transfer included | `+ actualQty` | — | `Return` (as before) |
| Refused delivery unloaded at the yard | `+ qty` | — | `Return` (as before) |

A refused delivery never reached the site, so the site figure doesn't move.

### One helper, gated by its callers

Every site change goes through one private Bubble helper,
**`adjust-site-stock`**. Params: `materialId`, `name`, `unit`, `location`,
`delta`, `floorAtZero`, `reason`, `requestId`, `tripId`, `byName`. It:

1. **creates the row** when `Search for materialsitestock (materialID, location)
   :count is 0`, with `qty` = the delta (or 0 if the delta is negative);
2. **changes the existing row** (`:first item`, oldest first) only when *Result
   of step 1 is empty*. That avoids reading back a row created earlier in the
   same run;
3. **writes the history row**.

The helper is **not idempotent by itself.** It is only ever scheduled from a
trip helper that is **gated on the row's `state`** and **flips that state last**
(`drop-material-at-site` in 5D, `load-trip-material` in 5F). A replayed call
finds the state already flipped and schedules nothing. That is the same retry
rule as `return-material-stock`.

**Two first drops at once can create two rows** for one item and site, because
Bubble has no unique constraint. The reader adds rows up by `(materialID,
location)`, and writers always touch the oldest one, so nothing is lost.

---

## Trips — what changes

Nothing about a trip's shape changes. A stop is still a location; a trip is still
a driver and an ordered list of stops. Material lines join tools in the builder's
pool, the planner, the run sheet and the PDF.

| Movement | Collect at | Drop at |
| --- | --- | --- |
| Material delivery | `Warehouse` | the request's `job` |
| Material pickup | the request's `job` | a warehouse (choosable, `WAREHOUSE_JOB_NAMES`) |
| Material pickup **linked to a delivery** (transfer, 5F) | the pickup request's `job` (A) | the line's `transferToLocation` (B). **Not choosable** in the builder: the link decided it |

**A line can go out over several trips.** The builder offers the outstanding
quantity and lets the dispatcher lower it ("8 of the 20 today"). One
`tripmaterial` row per line per trip.

### `tripmaterial.state` — same vocabulary as `triptool.state`

| State | Delivery line | Pickup line |
| --- | --- | --- |
| `Planned` | on a draft or not reached yet | same |
| `Loaded` | in the van (`actualQty = qty`) | collected; `actualQty` = what the driver counted |
| `Dropped` | landed at the job — warehouse untouched; **site `+ qty`** (inventory) | unloaded at the yard — **warehouse `+ actualQty`**; or, for a transfer, landed at B — **site B `+ actualQty`** |
| `Skipped` | couldn't be loaded at the yard; still allocated, back in the pool | driver entered `0`; line stays outstanding |
| `Refused` | site turned it away; rides on to a warehouse stop | **transfer only**: B turned it away; rides on to a warehouse stop (a warehouse never refuses) |
| `Returned` | unloaded at the yard — **warehouse `+ qty`, `assignedQty − qty`** | a refused transfer unloaded at the yard — **warehouse `+ actualQty`**; the line counts as done |

A pickup's `Loaded` also takes the count off the site it left (`Collect`). The
material has physically left that site, whichever way the trip goes next.

The routing of a refused row (to the next `Warehouse` stop, or a synthesised
`#return` stop) is **the tool rule, reused** — `stopWork` in
`lib/bubble/trips-types.ts` does it by state, not by key, and it now does it for
both row kinds.

## Site-to-site transfer

*Re-planned 2026-09-28. This replaces the original "not supported" call.* That
call rested on three gaps, and this design closes each:

- **No origin to take from.** The origin is now a pickup request at A, and A's
  site stock.
- **No identity to match on.** The match is by `materialID`.
- **Warehouse arithmetic.** A transfer never touches the warehouse.

It mirrors how tools move between jobs: raising a pickup at A is what makes the
material available to someone else.

### The link

- **A PM raises an ordinary pickup at Site A** (5F/5G), with an estimate as
  before. The pickup form now shows A's site figure as a hint.
- **On a delivery's assign page at Site B**, each inventory line lists its
  **transfer sources**. A source is an open pickup line meeting all of these:
  - same `materialID`, at another site;
  - its request isn't closed;
  - not linked to anything else;
  - no live trip row (`Planned` on an open trip, or `Loaded`), and not landed.

  The manager **links** a source to B's line. A pickup line nobody links goes
  to the warehouse, as before.
- **The link lives on the pickup line.** It is three `requestedmaterials`
  fields: `transferToLineID` (B's line), `transferToRequestID` and
  `transferToLocation` (B's job name, the trip destination).
- **Linking** is a plain Data API **`PATCH`** of the three fields. It changes
  one row, moves no stock and creates no children: the `/tools/[toolId]` rule.
  (It was two writes, approve then `PATCH`, until pickup approval was dropped
  on 2026-10-05.) **Unlinking** is a `PATCH` clearing the fields, refused once
  the line has a live trip row.
- **Whole-line, split on link** *(changed by the user 2026-10-05; was "the
  extra stays in B's site stock")*. One pickup line still has one destination
  and goes on one trip whole. When a pickup's estimate is more than B still
  needs (requested − assigned from stock − other transfers), linking **splits**
  it: the original is `PATCH`ed down to the need and linked, and the rest
  becomes a new unlinked line on the same pickup, heading for the warehouse.
  The remainder row is a plain Data API `POST` (one row, no children — the
  `/tools/new` rule), made first; a failed `PATCH` deletes it again. The driver
  counts the two lines separately at the stop. Cancelling the transfer leaves
  both lines going to the warehouse; they aren't merged back. A line that's
  already covered offers no transfer.

### What the delivery line counts

B's `assignedQty` stays **warehouse units only**, so the stock invariant holds
unchanged. Beside it:

- **coverage** = `assignedQty` + Σ linked pickup lines. A linked line counts its
  estimate until it is counted, then its `actualQty`.
- **the warehouse target is capped** at `effectiveQty(line) − linked coverage`,
  floored at 0. Link first, then top up from stock.
- **delivered** = own `Dropped` qty + Σ linked rows' `actualQty` `Dropped` at B.
- **done** = delivered ≥ `quantity`, the rule it always had.

### On the trip

- The linked line's movement is **`A → B`**, fixed. The planner needs nothing
  new: it's an ordinary edge, alongside B's own warehouse delivery.
- **At A** the driver counts, as for any pickup. A's site figure goes down
  (`Collect`).
- **At B** it's an ordinary drop. B's site figure goes up (`Deliver`). The
  pickup line is done, and B's delivery line progresses.
- **B can refuse it.** It then rides on to a warehouse stop, as a refused
  delivery does. Unloaded there, the warehouse goes up by `actualQty` and the row
  becomes `Returned`. The pickup line is **done**, because it left A: the tool
  rule, see `hasLanded`. B's line is short again, and the manager tops it up.

### Status and closing

- **Both requests move.** Any stop that touches a linked pickup row must sync the
  pickup's request **and** `transferToRequestID`. It's the `touchedToolIds`
  lesson: a `tripmaterial` row names only the pickup's request.
- **Close request**, on either side, first clears the link on any linked line
  not yet collected. The existing refusal for rows on a truck or a draft trip
  still applies.

### Not supported

- Taking material straight out of site stock with no pickup request. Raise the
  pickup; that is what makes it available.
- Splitting one pickup line between the warehouse and B.

Both are extension points. Nothing in this design blocks them.

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
- **Site figures overstate.** They are *delivered − picked up*, and use on site
  isn't tracked (decision 9). A finished job keeps its figure until someone
  raises a pickup there.
- **Sites start at zero.** Material already on sites before 5D ships is unknown,
  and there's no backfill. Nothing had travelled on a material trip before 5D.
- **A site collect floors at 0**, so a count above the site figure loses the
  difference. The driver's count is still recorded on the trip row.
- **Duplicate site rows** from two simultaneous first drops are added together
  on read, not merged in Bubble.
- **Whole-line transfers only**, and **pickups are the only transfer source**
  (see Site-to-site transfer, *Not supported*).
