# Phase 2 — request lifecycle + tool location lifecycle

**Start here.** This is the master design for phase 2. Each slice has its own
doc with the file list and checklist:

| Slice | Doc | State |
| --- | --- | --- |
| **2A — Assign** | [`phase-2a-assignment.md`](./phase-2a-assignment.md) | in progress |
| **2B — Dispatch** | [`phase-2bc-dispatch-offload.md`](./phase-2bc-dispatch-offload.md) | built, live |
| **2C — Offload** | [`phase-2bc-dispatch-offload.md`](./phase-2bc-dispatch-offload.md) | built, live |

The Bubble Studio build guide for all three is
[`bubble-request-status-workflow.md`](./bubble-request-status-workflow.md).

## What phase 2 is for

Phase 1 shipped request **creation** only. A request names tool *types* with
quantities (`requestedtools.toolsSummary` — `"Pump Jack Electric: 2"`) but
never names the **physical `tools` rows** that go on the truck, and
`tools.location` is only ever read, never written. Nobody can answer "which
grinder is on this job" or "where is grinder #7 right now".

Phase 2 adds three steps after creation:

1. **Assign** — pick real `tools` rows against the requested types, filtered by
   availability on the request's date window. A slot may be left empty; extra
   tools may be added.
2. **Dispatch** — a driver/PM takes **one or more requests at once**; their
   tools go In Transit.
3. **Offload** — on site, the request's tools land at the job.

## Decisions already made

Don't re-litigate these; they were settled with the user.

- **Delivery requests only.** Pickup gets the mirror lifecycle later, on the
  same fields.
- **Assignment lives in a child table**, not a list field on `request`.
- **Writes go through Bubble workflows**, not Data API `PATCH`.
- **Availability = date overlap plus a condition filter.**
- **Multi-request trips** — one driver can take several requests in one go.
  A trip is *derived*, not a table.
- **Unassign ships. Return-to-warehouse does not.**
- `request.status`, not `stage`. `assignedtools.toolType`, not `slotName`.

---

## Schema

### `tools.statusNew` — a second field, not a replaced option set

> **Superseded, and this is the as-built record.** The plan below was to
> *replace* the values on `tools.status`. What was actually built is a new
> `ToolStatusNew` option set holding the values in the right-hand column
> (nine, now that `Assigned` has been removed — see below), and a new
> `tools.statusNew` field typed as it. The original `status` and its option
> set are untouched.
>
> The reason is the second writer: the old Bubble UI's `/wf/Set Status` writes
> `tools.status` from outside this app, and a rename would have silently
> redefined what its rows mean. Two fields is the honest version.
>
> **The trade:** `statusNew` is empty on every existing row, so the condition
> filter excludes nothing until rows are backfilled — a tool whose old `status`
> reads `To be Repaired` is currently offered for assignment. The date-overlap
> check below is unaffected and is the real guard. And "where is grinder #7" has
> two answers until `status` is retired, which is deferred: the Tools dashboard
> and Pickup picker still read and write the old field.

`tools.status` is a **Bubble option set**, and an option-set write with an
unrecognised value **fails silently** (see `CLAUDE.md`). The lifecycle rides on
`statusNew`, whose values are:

| Today (`lib/bubble/enums.ts`) | New |
| --- | --- |
| Ok | **Available** |
| Ready for Pickup | **Pickup Requested** |
| To do Maintenance | **Maintenance Required** |
| To be Repaired | **Repair Required** |
| Repairing / Under Maintenance | **Under Repair** |
| Missing | **Missing** |
| Discharged | — *not in the new list; keep it, or migrate those rows first* |
| — | **In Transit** · **Delivered** · **Inspection Required** |

> **`Assigned` was considered and dropped** — see the Assign/Unassign row
> below. Removed from the `ToolStatusNew` option set in Bubble Studio too,
> since nothing ever wrote it to a live row.

**Nothing was renamed and nothing was deleted** — see the note above. The
left-hand column is what `tools.status` still holds; the right-hand column is
the full `ToolStatusNew` set, including `Discharged`'s absence from it (old
rows keep `Discharged` in the old field, which no longer matters here).

> **One field, two concerns.** The list mixes *where a tool is in the flow*
> (Available, In Transit, Delivered, Pickup Requested) with *what
> condition it's in* (Maintenance Required, Repair Required, Under Repair,
> Inspection Required, Missing). A Delivered tool that needs repair can only
> say one. Resolution for now: **condition wins** — a tool in any of the five
> condition states is never offered for assignment. Splitting into two fields
> is the real fix if this bites.

### `tools` — one new field, `statusNew`

Because `statusNew` carries the lifecycle, `location` means **current
physical place, or whoever currently has custody of it** — written at two
moments: dispatch (the driver's name) and offload (the job's `name`). The
original `status` column is never written by this phase.

| Step | `statusNew` | `location` | `currentUser` | Slice |
| --- | --- | --- | --- | --- |
| Assign | `Assigned` | unchanged | unchanged | 2A (reversed, see below) |
| Unassign | `Available` | unchanged | unchanged | 2A (reversed, see below) |
| Dispatch | `In Transit` | **the driver's name** | driver | 2B |
| Offload | `Delivered` | the job's `name` | driver (kept) | 2C |

> **Reversed 2026-09-14 — the "Decided against" call below didn't hold up.**
> It assumed availability stayed date-driven, so flipping `statusNew` at
> assign time was unnecessary risk for no payoff. In practice the date-overlap
> check it depended on was wrong in both directions: a job that ran long left
> a genuinely-busy tool bookable the moment its planned end date passed, and a
> job that finished early left a genuinely-free tool blocked until its planned
> end date arrived — both confirmed live. Availability is now
> `isFreeToAssign(statusNew)` — `Available` or `Pickup Requested` — so
> Assign/Unassign have to be real writers of it again. Traded away: a tool can
> no longer be pre-booked for a future request while busy on a different one
> — see `lib/bubble/enums.ts`'s `TOOL_STATUS_NEW`/`isFreeToAssign` doc
> comments, and `lib/bubble/requests.ts`'s `markToolsAssigned`/
> `releaseToolsToAvailable`.
>
> **Original "Decided against: `Assign` → `Assigned`, `Unassign` →
> `Available`" note, kept for context.** The original plan had assign/unassign
> flip `statusNew` alongside the `assignedtools` row. Dropped because a tool
> can legitimately be assigned to a *future* request while it's currently
> mid-flow on a different one (`In Transit`, `Delivered` elsewhere, `Pickup
> Requested`) — writing `Assigned` at assign time would clobber that real
> current state with a value that's only true for the one case it's harmless
> (a tool sitting `Available` in the warehouse), which is exactly the case
> that needed no flag in the first place. The `assignedtools` row is the sole
> record of the commitment — it's already what the date-overlap availability
> check reads, so no double-booking guarantee depends on `statusNew` either.
> See `docs/bubble-update-request-status-spec.md` §6.
>
> **Known gap left by the reversal, accepted deliberately:** nothing resets a
> tool to `Available` except a clean pre-dispatch Unassign. A tool that reaches
> `Delivered` — or is left mid-flow — stays non-`Available` until someone
> edits the row directly in Bubble Studio. A dedicated "mark tool Available"
> screen is planned but not yet built.

> **Superseded — the original design left `location` unchanged at dispatch.**
> The reasoning was that a synthetic `"In Transit"` location string would
> interleave a flow-state value among the dashboard's 1,445 job names, alongside
> `NO_LOCATION` as a second magic constant. The user's call instead: `location`
> during transit **is** the driver's (or PM's/user's) name — the same string
> written to `request.driver` and `tools.currentUser` — so it can hold a place
> (`Warehouse`, a job's `name`) or a person, and "where is grinder #7" during
> transit reads as *Carlos · In Transit*, not *Warehouse · In Transit · Carlos*.
> The Tools dashboard (`components/tools-dashboard.tsx`) groups by whatever
> string `location` holds with no special-casing beyond `NO_LOCATION`, so a
> driver's name becomes its own group card there with no code change needed.
>
> **The trade:** the pre-dispatch value (always `Warehouse`, since a delivery
> only ever originates there — see "Known limits") is overwritten, not stored.
> Reverting a dispatch by hand in Bubble now has to explicitly reset `location`
> back to `"Warehouse"` — previously it would already still read that.

`currentUser` is **not** cleared on offload — it is a real record of who moved
the tool, and `lib/bubble/pickup-tools.ts` notes it is already non-empty on
some live rows.

### `toolshistory` — two new fields, one per dispatch/offload tool

Confirmed live schema (via a read-only API check — this table was previously
unread by this app): `tool` (link to `tools`), `prevLocation`/`newLocation`
(text), `prevLocationFloor`/`newLocationFloor` (text), `prevStatus`/`newStatus`
(option set — the **old** `Tool Status` set), `notes` (text), `picture`
(text). It already holds ~1,542 real rows, written by the pre-existing
`/wf/Set Status`/`/wf/Set Location` workflows (the old Bubble UI) — this app
never wrote it before.

`prevStatus`/`newStatus` can't hold this phase's `ToolStatusNew` values (wrong
option set — same "would fail silently" problem `tools.statusNew` was invented
to avoid), and retyping them risks blanking the 1,542 existing rows. So two
new fields carry it instead: `prevStatusNew` / `newStatusNew`, both option set
`ToolStatusNew` — the same parallel-field pattern as `tools.statusNew` itself.

Dispatch and offload each produce one `toolshistory` row per tool — **not**
via an explicit step in `update-request-status` (an earlier design did that
and was reverted 2026-09-10; see `docs/bubble-update-request-status-spec.md`)
but as a side effect of `DB - Tools Change Log`, a pre-existing backend
workflow outside this project that fires on `A tools is modified` and logs
every `tools` save automatically. `update-request-status`'s own tools-update
step is enough to trigger it — nothing else is needed.

### New type: `assignedtools`

Mirrors the existing `requestedtools` child-row shape, id-as-text convention
included.

| Field | Type | Holds |
| --- | --- | --- |
| `requestID` | text | The `request._id`. Not a link — same pattern as `requestedtools.requestID`. |
| `toolID` | text | The `tools._id`. |
| `toolType` | text | The `toolstype` name from `toolsSummary` this tool fills. **Stored, never re-derived.** |
| `extra` | yes/no | True when the tool wasn't requested — an addition, not a slot fill. |

**Why a table and not a list field on `request`.** Storing `toolType` at assign
time is what makes this safe. Re-deriving it each render by matching
`tools.type` → `toolstype.name` against `toolsSummary` breaks silently on:

- renamed `toolstype` rows — a six-month-old request's slots would change;
- `tools` rows with a blank or dangling `type` — `listToolsForJob` already
  carries two defensive branches for exactly those, so they exist;
- names `parseToolsSummary` can't round-trip — it splits on the **last** colon
  and live names contain colons.

A child row is also queryable from the **tool** side with the
`{key, "in", [...]}` pattern `withLines` already proves, and makes unassign a
row delete instead of a rewrite-the-whole-list lost-update race.

### `request` — 2 new fields

| Field | Type | Holds |
| --- | --- | --- |
| `status` | **text** (not option set) | `New` · `Assigned` · `In Transit` · `Delivered` — deliberately the same words as the tool lifecycle values. Text, so an unexpected value fails loudly in Zod rather than silently in Bubble. |
| `driver` | **text** | The driver/PM's name, same free-text convention as `fieldPM2`. Unused until 2B. |

A row with no `status` reads as `New`, so none of the ~1,550 existing rows need
backfilling.

### Why no `transport` table

A trip is **derived**: a driver's live manifest is
`request where driver equals X and status equals "In Transit"`. A request
leaves that set when offloaded, so the query is self-cleaning. Dispatching
several requests together is one call carrying several `requestIds`.

---

## Workflows

Full Bubble Studio build steps are in
[`bubble-request-status-workflow.md`](./bubble-request-status-workflow.md).
**`update-request-status` is built and live**, alongside the assignment
workflow — see [`phase-2a-assignment-handoff.md`](./phase-2a-assignment-handoff.md)
for assignment, and `docs/bubble-update-request-status-spec.md` for the
current, up-to-date build sheet for `update-request-status` (dispatch and
offload are its confirmed-live consumers; assign's tool-status half is still
prospective).

### `create-assigned-tool`

> Named `assign-request-tools` in the original design. The as-built names came
> out swapped: the **public** endpoint is `create-assigned-tool` and the
> private per-item helper is `assign-request-tool` (singular).

| Param | Type |
| --- | --- |
| `requestId` | text |
| `assignments` | **list of objects** — `{ toolId, extra, toolType }`, via Bubble's Detect Data |

Deletes this request's existing `assignedtools` rows, then fans out over
`assignments` into the helper `assign-request-tool`, then sets
`request.status = "Assigned"`, then returns `{ ok, count }`. The delete-first
step is what makes the workflow **idempotent** — `lib/bubble/client.ts` retries
a POST on 429/5xx, so a 502-after-commit would otherwise double the rows.

`toolID` is a clean Bubble id and is **item #1**, so a `::` inside a tool-type
name can only corrupt the cosmetic `toolType` label, never the tool identity.
The encoder normalises `::` → `:` in `toolType` before sending.

### `update-request-status`

| Param | Type |
| --- | --- |
| `requestIds` | text **list** |
| `status` | text |
| `driver` | text (optional) |
| `toolIds` | text **list** (optional) |
| `toolStatus` | **the Tool Status option set**, not text |
| `toolLocation`, `toolUser` | text (optional) |

One *Make changes to a list of things* on `request`, one on `tools`, each field
guarded by an *only when this param is not empty* condition so an omitted param
never blanks anything.

> **No `Schedule API Workflow on a list` for the tool writes.** The existing
> `update-tool-status` needs a fan-out because every tool gets a *different*
> status. Here all tools in one transition share one destination, so a single
> synchronous list-change does it. That removes the fire-and-forget hole
> `bubble-pickup-tool-status-workflow.md` itself calls out ("a slow or failed
> individual `tools` update never blocks or fails the request creation") —
> which for a *location* lifecycle would leave a load half-updated with nothing
> reporting it — and removes the `revalidatePath`-races-the-fan-out problem.

**Unassign needs no workflow** — one `bubbleDelete("assignedtools", rowId)`
using the already-written-but-unused helper in `lib/bubble/client.ts`, plus an
`update-request-status` call resetting that tool to `Available`.

---

## Availability

**Reversed 2026-09-14, along with the Assign/Unassign row above.** This
section originally described a date-overlap check, kept below for history —
see `lib/bubble/assigned-tools.ts`'s module doc comment for the current
design. Availability is now `isFreeToAssign(tools.statusNew)`, checked
directly off the tool — no cross-request query at all.

- Condition still filters separately, unchanged: drop `Maintenance Required`,
  `Repair Required`, `Under Repair`, `Inspection Required`, `Missing`
  (`isAssignable`).
- `isFreeToAssign` (`lib/bubble/enums.ts`) accepts `Available` **and**
  `Pickup Requested` — a tool `leaveBehindAction` left behind stays offerable
  for a future request by design, it's just never silently reverted to
  `Available`. `Assigned`, `In Transit` and `Delivered` are the only real
  holds.
- The candidate queries (`listCandidateTools`/`searchTools`) filter on both
  checks and **drop** anything that fails either — a PM assigning tools only
  ever sees ones it's actually possible to add, full stop. A tool already on
  *this* request is unaffected: it's merged in separately by id
  (`listToolsByIds`), regardless of its live status, so it stays
  removable/re-addable in the same editing session.
- **Re-run the check inside the assign action** immediately before the write,
  scoped to only the *newly*-picked ids (a diff against the request's prior
  `assignedtools`) — re-submitting a tool already on this request isn't a new
  claim and needs no re-check. Bubble has no transactions or unique
  constraints, so this narrows the double-assign window from minutes to about
  a second. It cannot close it.

<details>
<summary>Original date-overlap design (retired)</summary>

Two queries, both patterns the repo already proves.

```ts
// 1. Requests whose date window could overlap. Widened a day each side, because the two
//    write paths disagree about requestDateEnd: createToolRequest sets NY midnight of the
//    last day (which excludes that day), createPickupToolRequest sets start + 30 min.
//    The precise overlap is then done in JS on a normalised end.
const overlapping = await bubbleListAll("request", {
  constraints: [
    { key: "requestDateEnd", constraint_type: "greater than", value: widenedStart },
    { key: "requestDateStart", constraint_type: "less than", value: widenedEnd },
  ],
})

// 2. Every tool those requests hold — one `in` query, the exact shape `withLines` uses.
const taken = await bubbleListAll("assignedtools", {
  constraints: [{ key: "requestID", constraint_type: "in", value: overlapping.map((r) => r._id) }],
})
```

Why it was dropped: both directions of date drift turned out to be real. A job
running long left a genuinely-busy tool looking free the moment its planned
end date passed (no overlap detected); a job finishing early left a
genuinely-free tool looking taken until its planned end date arrived (overlap
still detected). There's no actual-completion timestamp in Bubble to fix that
with, only the planned dates — so the fix was to stop trusting dates for this
at all.

</details>

---

## Known limits, carried forward

- **`tools.status` mixes flow and condition.** Condition wins for assignment;
  two fields is the real fix if it bites.
- **Driver source is unresolved.** `pms` is 12 Project Managers, not drivers.
  `driver` is free text with the PM list as a convenience. Needs answering
  before 2B ships widely.
- **Return-to-warehouse is out of scope.** After dispatch, a mistake is
  repaired in Bubble.
- ~~**Site-to-site redeployment isn't supported**~~ — **built as 2D**, see
  [`phase-2d-site-to-site-transfers.md`](./phase-2d-site-to-site-transfers.md).
  A delivery no longer starts at the Warehouse by definition: a tool already
  `Available` on another job site stays put through dispatch and moves only on
  an explicit driver confirmation. No schema or workflow change was needed —
  `update-request-status` ignores any tool whose id isn't passed to it, which
  is what makes deferring one possible.
- `ALLOW_DEV_LOGIN=true` "checks nothing" per `CLAUDE.md`. Phase 1 wrote
  request rows; phase 2 moves physical inventory. Dispatch and offload
  shouldn't reach real users while dev-login is on.
- `requireSession()` is **commented out** at
  `app/(app)/requests/actions.ts:18` and absent from both pickup actions, so
  those three server actions are reachable unauthenticated by direct POST.
  Fixed as part of 2A.
- **No advance scheduling, since the Availability reversal above.** A tool
  can't be pre-booked for a future request while it's busy on a different one
  — it simply isn't offered until it's back to `Available`.
- **No general reset-to-`Available` path yet.** The new Unassign write is
  currently the *only* writer of `Available` anywhere in this app. A tool that
  reaches `Delivered`, or is left mid-flow, stays stuck until someone edits
  the row directly in Bubble Studio, or a planned "mark tool Available" screen
  ships.
