# Phase 4 — real trips, built from stops instead of requests

**Start here.** This is the master design for phase 4. The Bubble Studio build
sheet is [`bubble-trip-workflows-spec.md`](./bubble-trip-workflows-spec.md).

Read [`phase-2-lifecycle.md`](./phase-2-lifecycle.md) first — phase 4 keeps its
schema, its conventions and its vocabulary, and replaces only the part that
decides *what moves together*.

| Slice | State |
| --- | --- |
| Schema + workflows (Bubble Studio) | **not built** — spec written, nothing in Studio yet |
| 3B — pickup requests record their tools | **built** (Next.js half; Studio half in the spec, §10) |
| `assignToolsAction` bug fix | **built** |
| Pure layer — planner, validator, progress | **built** |
| Bubble read/write layer | **built**, unexercised |
| Builder, trip board, run sheet | **built**, unexercised |
| Deleting the dispatch subtree | **not done** — deliberately last |

## What phase 4 is for

Phase 2 shipped dispatch as a **request-shaped** operation: tick whole requests,
pick a driver, and `/dispatch/active` reconstructed a "trip" by grouping
`request where status is In Transit` by driver *name*. It said so deliberately —
*"Trips are derived, not stored"*.

Three things that bought are now the three things breaking:

1. **A request could only go out with one driver.** The unit of dispatch was the
   request, so a large one couldn't be split across two trucks or two days.
2. **Site-to-site collects were nested inside a request.** `pickupStops`
   (phase 2D) hung "collect two tools from Job B" under the Job A row that
   wanted them. A driver could read the card and still not know where to go
   first.
3. **A request completed whole or not at all.** `offloadAction` wrote
   `Delivered` across the request, so a partially-sent request had nowhere to
   live.

A trip is now a real thing: **a driver and an ordered list of stops.** Dispatch
selects **tools**, not requests. A request stays open across as many trips as it
takes, and anything already on a truck or delivered is frozen against later
edits.

## Decisions already made

Settled with the user 2026-09-15. Don't re-litigate these.

- A trip **saves as a `Planned` draft first** — editable and reorderable — and a
  separate **Start trip** moves inventory.
- The builder shows **one pool of outstanding movements grouped by request**,
  ticked across several requests at once.
- A request **auto-closes only when every assigned tool has landed and every
  requested quantity is filled**; otherwise it stays partial and keeps accepting
  assignments. **Close request** is the manual escape hatch.
- The trip flow **replaces** request-level dispatch entirely.
- **Trips carry standalone pickup requests**, not just the site-to-site collects
  belonging to a delivery.

---

## Both directions are one row

A delivery and a pickup are the same movement pointed opposite ways —
`phase-3-pickup-lifecycle.md` already said so (*"The middle hop is
byte-identical"*). Once a trip is a list of stops they stop being separate flows
at all:

| Movement | Collect at | Drop at |
| --- | --- | --- |
| Delivery | Warehouse | the request's `job` |
| Site-to-site (2D) | another job | the request's `job` |
| Standalone pickup | the request's `job` | a warehouse |

So one trip legitimately runs *Warehouse → Job A (drop a delivery, collect a
pickup) → Job B (drop) → Warehouse (drop the pickup)*, which is what a driver
actually does and what none of the old screens could express.

### What this did to phase 3

- **3B moved into this phase and is built.** Without physical tool ids on a
  pickup request there is nothing to put on a trip.
- **3C and 3D are cancelled, absorbed here.** 3C is "collect the tools" — a
  collect stop. 3D is "drop them at a warehouse" — a drop at a `Warehouse`-kind
  stop. Neither needs a screen, route or action of its own any more. Both docs
  are marked superseded rather than deleted.
- **3D's "No partial return" limit is lifted.** It existed because
  `update-request-status` can only write one `toolLocation` per call. Each
  `triptool` row carries its own `toLocation`, so one trip can return different
  tools to different warehouses.

---

## Schema

Three new types — full field lists in
[`bubble-trip-workflows-spec.md`](./bubble-trip-workflows-spec.md) §1. The parts
worth arguing about:

### One `triptool` row per tool, not per leg

A tool's whole journey is one row: collected at `fromStopKey`, dropped at
`toStopKey`.

Per-leg rows were rejected for a specific reason. Bubble has no transactions and
*Schedule API Workflow on a list* demonstrably half-fails — which is why
`assignTools` count-checks. With a row per (stop, tool, action), a partial
fan-out leaves a tool **collected and never dropped**, indistinguishable from
one legitimately still on the truck. In the one-row model that state cannot be
represented at all.

The per-leg audit trail people want from split rows already exists: every leg
writes `tools.location`, and `DB - Tools Change Log` turns each write into a
`toolshistory` row.

### `stopKey`, and why it is derived rather than random

`save-trip` deletes and recreates every stop, so `tripstop`'s own unique id is
destroyed on each save — the same instability that already rules out pointing at
`assignedtools._id` (`create-assigned-tool` replaces those rows wholesale too).

`stopKey` is **derived from the stop's identity**, not randomly generated, and
that is load-bearing: the builder plans in the browser, the server re-plans from
its own fresh read, and the dispatcher's drag order crosses that boundary as a
list of `stopKey`s. With random keys the server's re-plan would produce a
different set, every lookup would miss, and the drag would be silently discarded
in favour of the algorithm's own order. Keys read as `Warehouse#collect`,
`107 Greenwich St - J24-0407` — legible in Bubble's data tab, which a UUID never
would be.

### Drop semantics come from the stop, not the request

| Drop at a stop whose `kind` is | Tool becomes | `location` written |
| --- | --- | --- |
| `Job` | `Delivered` | the job's `name` |
| `Warehouse` | `Available` | the warehouse's `name` |

One rule, both directions, no per-tool branching. A tool back in the yard is
free again, which is what `Available` has always meant. `currentUser` is not
cleared either way — it stays the driver, a real record of who moved it,
matching 2C and 3D both.

`kind` is **stored on the row, never re-derived**: `WAREHOUSE_JOB_NAMES` is a
constant that will grow, and a trip planned today must not silently reclassify
its own stops — and so its own write semantics — when a name is added tomorrow.

### `tripstop` has no `status`

A stop is done when every `triptool` touching it has finished with it
(`isStopDone`). A stored copy would be a second source of truth that starts
lying the moment an item is added to a stop already marked done.

### `triptool.state`: both halves of a stop can fail

| State | Meaning | What it writes to `tools` |
| --- | --- | --- |
| `Planned` | Not reached yet | — |
| `Loaded` | In the van | `In Transit`, `location` = driver |
| `Dropped` | Landed where it was going | `dropStatus`, `dropLocation` |
| `Skipped` | The **collect** failed | `statusNew = "Pickup Requested"`, nothing else |
| `Refused` | The **drop** failed — the site turned it away | **nothing** |
| `Returned` | A refused tool unloaded back at the yard | `Available`, the warehouse name |

`Skipped` is the old `leaveToolsBehind` contract exactly: the tool stays where it
is, `location` and `currentUser` untouched.

`Refused` is its mirror, and writes even less. The tool is in the van, so
`In Transit` at `location = driver` is already true and stays true — there is
nothing honest to write. The row keeps its original `toStopKey`/`toLocation`,
which makes it the only record of **which site refused it**; there is one
`triptool` row per tool per trip, so overwriting the destination would spend that
fact. `stopWork` therefore routes a refused drop **by state, not by key**: to the
next `Warehouse` stop the route already visits, or to a synthesised terminal one.

`Returned` exists rather than reusing `Dropped` because that routing has to
survive the unload. Read back as `Dropped`, the row drifts to the stop its
`toStopKey` still names and wears a green "Done" chip at the address that refused
it, ticking a delivery that never happened.

A tool still `Loaded` — or `Refused` — at the end is simply still on the truck,
which is derivable (`isOnTruck`) rather than a state.

### A run sheet can show a stop Bubble has no row for

When a refusal happens on a route that ends at a job site, `stopWork` synthesises
a terminal `Warehouse` stop keyed `#return` so the driver has somewhere to record
bringing the tool home. **It has no `tripstop` row**, which works only because
`complete-trip-stop` passes `stopKey` and reads it in no step.

The alternative — creating the row mid-run — needs a new exposed Bubble endpoint
(and §4 of the build sheet already records `assign-request-tool` being left public
by accident once), turns a pure derivation into a write that can half-land
leaving a trip that can never finish, and needs its own settle poll for Bubble's
async row creation. Mid-run stop creation is out of scope for this phase; a
derived stop is not.

Consequence to know: a Bubble-side count of a trip's stops can read one lower
than the run sheet showed. The facts are all still recorded — the `triptool` row
carries the refusing site in `toLocation`, and `toolshistory` carries the move
back to the yard.

### A refusal leaves no trace in `tools` — so it is read off `triptool`

Writing nothing is what makes `Refused` honest, and it is also what makes the
refusal invisible everywhere else. The tool goes out `In Transit`, is turned away,
and comes home to `Available` at `"Warehouse"` — which is character for character
what a tool that never left the yard reads. `classifyTool` returned `null` for it,
so on `/requests/[requestId]` a refused tool rendered as perfectly ordinary and
the obvious next move was dispatching it straight back to the site that had just
said no.

`listTripFlags` (`lib/bubble/triptool-read.ts`) is the fix, and it is a widening
of the lookup that already existed for skips rather than a new one. It returns
`requestId → toolId → TripFlag` instead of a set of skipped ids:

| `triptool.state` | `tripFlagOf` | row on the request page |
| --- | --- | --- |
| `Skipped` | `"skipped"` | amber **Not picked up** — still at its site |
| `Refused`, `Returned` | `"refused"` | amber **Refused** — turned away, coming back or home |
| anything else | `null` | nothing to say |

Three properties carry over from the skip lookup unchanged, and all three matter:

- **Newest row wins**, so putting the tool on a fresh trip writes a `Planned` row
  and the flag clears itself. Nothing has to remember to unset it.
- **Keyed by request as well as tool**, because a refused tool goes back to
  `Available`, `isFreeToAssign` counts that as free, and a second request can
  claim it while the first still has the refusal to answer for.
- **`Returned` flags the same as `Refused`.** The moment the flag would otherwise
  disappear is precisely the moment it is needed — the unload at the yard.

`refused` is tested **before** `carried` in `classifyTool`. A refused tool really
is `In Transit` with the driver until the return stop, so `carried` matches it and
would report "On the truck" — true, and the wrong thing to say about a tool coming
home from a delivery that failed.

`TripToolStatus.leftBehind` became **`undeliverable`** in the same pass, and the
rename is the point: `offloadAction` subtracts that list from what it writes
`Delivered`, and a refused tool must be in it. Left out, the legacy
Complete-delivery path would mark a tool `Delivered` at the job while it sat in
the yard — the exact lie the whole `Refused` state exists to avoid.

### Two warehouse constants, deliberately different

Read live 2026-09-15: **70 distinct `tools.location` values across 532 tools,
exactly one a warehouse — `"Warehouse"`, on 229 of them.** No casing or
whitespace variants. Neither `"1407 Locker"` nor `"Other - Not a Job Site"`
appears on a single tool.

- `WAREHOUSE_LOCATIONS` (3 entries) — the **origin** question: does a tool here
  need a collect stop? Broader.
- `WAREHOUSE_JOB_NAMES` (`["Warehouse"]`) — the **destination** question: where
  a pickup can be returned to, and what makes a stop `Warehouse`-kind.

`phase-3d-warehouse-offload.md` asked for this call to be made from live data
rather than by accident. It was, and they differ. `check-bubble` now flags any
`tools.location` with no matching `jobs.name`, which is the standing guard
against typo drift.

---

## `request.status` — seven values, two terminal branches

```ts
["New", "Assigned", "In Transit", "Partially Delivered", "Delivered", "Partially Returned", "Returned"]
```

Text in Bubble, so adding values cost nothing there. The words shifted meaning
and the new readings are the ones to trust:

- `In Transit` — at least one of this request's tools is on a truck.
- the partials — at least one landed **and** at least one is still outstanding.
  Open, and still assignable.
- `Delivered` / `Returned` — closed.

**The union and the stepper had to stop being the same array.** `statusIndex`
was literally `REQUEST_STATUS.indexOf(status)` and `StatusStepper` mapped over
it, so a partial would have become a step every request appeared to pass
through. `DELIVERY_STEPS` / `PICKUP_STEPS` are what the stepper walks now, and
`statusStepIndex` maps both partials onto `In Transit`'s slot.

### Deriving it — a ratchet

`deriveRequestStatus` (`lib/trips/request-progress.ts`) is pure and shared
between browser and server. Its first rule is that a closed request stays
closed, and that single line is what makes **Close request** free: closing is
nothing but writing the terminal value, and the ratchet holds it there.

What counts as **landed** differs by direction and both halves are two-part
tests, because a status alone would count a tool that never moved:

- delivery — `Delivered` **and** `location === request.job`. `Delivered` alone
  could be a tool that landed on a different job.
- pickup — `Available` **and** at a warehouse. Unambiguous, because 3B flags
  every pickup tool `Pickup Requested` on a job site at creation.

Written in exactly two places, both **after** the tool writes commit:
`startTripAction` and `completeStopAction`, via `syncRequestStatuses`. Deriving
first would compute the status the request had a moment ago.

---

## The `assignToolsAction` bug this fixed

`app/(app)/requests/[requestId]/assign/actions.ts` diffed the submitted set
against the stored one and called `releaseToolsToAvailable` on everything
removed, **unconditionally**. That already let a `Delivered` tool be written
back to `Available` while it sat on a job site.

Under split dispatch it got worse: `create-assigned-tool` is a wholesale
replace, so a PM filling empty slots from a stale render could drop the
already-delivered tools out of the payload — resetting them *and* deleting the
`assignedtools` row that was the only record of the delivery.

Two guards, both needed:

1. **Refuse the save** if it omits a tool that is `In Transit` or `Delivered`.
   Filtering alone would still let the row be deleted, losing the history, which
   is worse than the status reset.
2. **Only release a tool still reading `Assigned`.** Everything else is left
   exactly as it is.

---

## Deriving stops from a selection

`lib/trips/plan.ts`, deliberately **not** `server-only` — the builder previews
the route in the browser on every tick and the action re-validates it. Every
tie-break is total: the client's output is the server's input.

1. Drop no-ops (`from === to`).
2. **One stop per distinct location**, because a single visit can drop and
   collect at the same time. This is what makes a delivery and a pickup to the
   same site one stop.
3. Topologically sort (Kahn), warehouse-first then alphabetical then node id.
4. On a cycle, **split one location** into a collect half and a drop half. Both
   carry the same `location`; only `stopKey` differs. Neither half is then both
   a source and a sink, which is what guarantees termination.

**Which node gets split decides whether the route reads naturally**, and the
obvious rule is wrong:

| Movements | Edges | Right answer |
| --- | --- | --- |
| Deliver to Job A **and** collect a pickup from Job A | `W→A`, `A→W` | **Split W**: `W(load) → A(drop, collect) → W(unload)` — one visit to the site |
| Tool X `A→B`, tool Y `B→A` | `A→B`, `B→A` | **Split A**, no warehouse involved |

So: among nodes that are both a source and a sink, prefer `Warehouse`, then
highest degree, then location, then id. Splitting Job A in the first row would
send the driver to the same address twice for no reason — and that row is now
the *common* case, not an edge case.

`lib/trips/validate.ts` holds the one invariant a drag can break — a tool is
collected before it is dropped. The builder **flags** a violation rather than
refusing the drag (refusing mid-gesture feels broken); the action rejects it.
The server never silently re-plans over a dispatcher's order.

---

## Screens

| Route | What |
| --- | --- |
| `/trips` | Drafts and runs under way. A card shows the route — `Warehouse → 107 Greenwich → Warehouse` |
| `/trips/new` · `/trips/[tripId]/edit` | The builder. Pool left, derived route right, drag to order |
| `/trips/[tripId]` | The run sheet — stops in order, each with collect/drop and a **Done here** action |
| `/requests/[requestId]` | Read-only about trips. **Add to a trip**, **Close request** |
| `/dispatch`, `/dispatch/active` | Redirect to the trip screens |

`?requestId=` on `/trips/new` seeds that request's movable tools, so a request's
own "Add to a trip" button lands somewhere useful.

---

## As built in Bubble (2026-09-15)

The three types, all eight workflows and §10's `new-pickup-request` retrofit
exist on `version-test`. Six things were decided in Studio that this side
depends on, recorded here because none of them is visible from the TypeScript:

- **The status guards are endpoint-level *Only when* conditions, not
  *Terminate* actions.** A refused call therefore returns **`200` with an empty
  `response`** — Bubble skips the whole workflow, *Return data from API*
  included. `lib/bubble/trips.ts#refused` exists solely for that: without it a
  guard doing its job surfaced as a raw Zod `expected number, received
  undefined`. **If any guard is ever rebuilt as a *Terminate* action, or given
  an error body, re-check that helper** — the empty object is the only refusal
  signal there is.
- **`create-trip` re-searches by `idempotencyKey`** for the `tripID` it passes
  to both fan-outs, rather than referencing *Result of step 1*. On a retry step
  1 is skipped, so its result is empty and every stop and item would be written
  with a blank `tripID` — orphan rows on the one path the key exists to protect.
- **`complete-trip-stop`'s `dropStatus` is typed as the `ToolStatusNew` option
  set**, per the convention that an option-set param is never declared as text.
  This side sends the option's display string (`"Delivered"` / `"Available"`)
  from `dropOutcome`.
- **`save-trip`'s guard was briefly inverted** (`status is not "Planned"`)
  during the build and corrected before use. Worth knowing it was possible:
  that direction lets a save run on a trip already under way, and since saving
  is delete-then-recreate it would have deleted `triptool` rows recording real
  drops and resurrected them as `Planned` — silently un-delivering tools
  physically sitting on a job site. It is the single highest-consequence
  condition in the set.
- **`new-pickup-request`'s `toolType` was briefly wired to `This tools's type's
  name`** — the tool's *category* — instead of `This tools's name`, the physical
  tool's own name. Caught during the build and corrected. Both expressions are
  valid Bubble and both produce a plausible-looking string, which is what makes
  this one dangerous: the wrong one silently breaks `buildSlots`, whose pickup
  counting matches `assignedtools.toolType` against `toolsSummary` entries that
  *are* physical names. "3 of 5 collected" would read 0 of 5 with every row
  present. The spec says don't "fix" this to a type name; it is now on record
  that someone already tried once.
- **`new-pickup-request` passes `requestId` straight from *Result of step 1***,
  and that is correct here even though `create-trip` must not. The difference is
  the idempotency guard: `create-trip`'s create step is conditional and gets
  skipped on a retry, leaving an empty result. `new-pickup-request` has no such
  guard, so its create step always runs and always has a result to chain off.

Still untested at time of writing: `complete-trip`'s double-call and
`cancel-trip`'s two status branches.

### The drop leg could never be recorded (fixed 2026-09-15)

The first live run of `complete-trip-stop` found a bug on **this** side, not in
Bubble: `isStopDone` and `TripStopActions` both read "outstanding" as
`state === "Planned"` for *both* sides of a stop. That is right for a collect
and exactly wrong for a drop — a tool waiting to be dropped is **`Loaded`**,
because it was collected earlier in the route. So every drop stop rendered
`Done` the moment its tools were on the truck, `TripStopCard`'s `live && !done`
hid the action, and a stop that both collected and dropped submitted an empty
`dropToolIds`. The tools stayed `In Transit` at the driver, and **Finish trip**
stayed disabled on "4 tools are still on the truck" with nothing on screen able
to take them off it.

The fix is `outstandingCollect` / `outstandingDrop` in `trips-types.ts` — one
definition per side, used by the derivation, the action UI and the server
action, so those three can't disagree again. `completeStopAction` now validates
against them rather than against stop membership alone, which also closes a
resubmit from a stale tab writing `Delivered` onto a tool nobody collected.
No data repair was needed: a stuck trip recovers by reloading the run sheet,
which now offers the drop.

## Known limits, carried forward

- **Pickup requests now persist their tool ids** — `new-pickup-request` takes a
  `toolIds` text list and fans `assign-request-tool` out over `Search for tools
  (unique id is in toolIds)`, so `toolType` and `extra` are read off each row
  inside Bubble rather than sent. Built and verified end to end on 2026-09-15.
  This was the last thing standing between phase 4 and a working pickup leg:
  a pickup with no `assignedtools` rows can never reach a trip.
- **Every trip write is live-capable but only partly tested.** Reads
  degrade quietly rather than failing — `bubbleListMaybeMissing` turns a 404
  into an empty list, which is why the spec's §1 "does `GET /obj/trip` 404?"
  check mattered. It passed.
- **The dispatch subtree is still on disk.** The two pages are redirects, but
  `app/(app)/dispatch/active/actions.ts` and the old components remain, because
  `confirmPickupAction`/`leaveBehindAction` still back the per-tool buttons on
  requests dispatched **before** phase 4 (no `triptool` rows, so no run sheet to
  finish them from). Live `In Transit` count was 2 at the start of the build and
  0 by the end of it, so this may already be drainable — check, then delete the
  subtree, `lib/dispatch/`, `lib/bubble/request-order.ts` and the orphaned
  components in one commit.
- **`request.order` is vestigial.** Left at whatever it holds and no longer
  read. Clearing ~1,550 rows would visibly reshuffle the old Bubble calendar,
  which sorts on it. The `set-request-order` workflow stays in Bubble, uncalled.
- **Pre-3B pickup requests never appear in the pool.** They have no
  `assignedtools` rows and are not backfilled — resolving names to ids is
  exactly the fragile inference 3B exists to avoid.
- **A request with both `delivery` and `pickup` true** has two lifecycles and one
  status field. Latent since phase 3; the forms never create one. It reads as a
  delivery.
- **No roles, and `ALLOW_DEV_LOGIN=true` "checks nothing".** Starting a trip and
  completing a stop move physical inventory.
- **A trip can't be edited once started.** By design — saving is
  delete-then-recreate, which would un-deliver tools already dropped. Adding a
  stop mid-run would need its own additive workflow.
