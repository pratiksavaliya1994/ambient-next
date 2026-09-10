# Phase 3 — the pickup lifecycle

**Start here.** This is the master design for phase 3. Each slice has its own
doc with the file list and checklist:

| Slice | Doc | State |
| --- | --- | --- |
| **3A — Condition split** | [`phase-3a-condition-split.md`](./phase-3a-condition-split.md) | not started |
| **3B — Pickup assignments** | [`phase-3b-pickup-assignments.md`](./phase-3b-pickup-assignments.md) | not started |
| **3C — Actual pickup** | [`phase-3c-actual-pickup.md`](./phase-3c-actual-pickup.md) | not started |
| **3D — Warehouse offload** | [`phase-3d-warehouse-offload.md`](./phase-3d-warehouse-offload.md) | not started |

Read [`phase-2-lifecycle.md`](./phase-2-lifecycle.md) first — phase 3 rides on
the schema, the workflows and the conventions it established, and this doc
assumes them.

## What phase 3 is for

Phase 2 shipped the **delivery** lifecycle end to end and closed with the
decision this phase cashes in:

> **Delivery requests only.** Pickup gets the mirror lifecycle later, on the
> same fields.

Pickup today stops at **request creation**. A PM picks a job, sees that job's
physical tools (`listToolsForJob`, constrained on `location equals jobName`),
checks the ones to collect, optionally edits each tool's status, and submits;
`new-pickup-request` writes `request` + `requestedtools` and fans out per-tool
status writes through `update-tool-status`. Everything after that is missing.

Three concrete gaps, each confirmed against the code:

1. **No durable record of which physical tools a pickup named.** The form picks
   `tools` rows but persists only their **names**, via `toolLinesOfPickup`
   (`components/pickup-tool-picker.tsx`) → `formatToolsSummary` →
   `requestedtools.toolsSummary` (`"Grinder #7: 1"`, quantity always 1). The
   tool *ids* exist only in the transient `toolStatusUpdates` list, consumed
   once and discarded. Nothing downstream can know what to collect. Delivery
   solved this with `assignedtools`; pickup must too — that is 3B.
2. **No pickup or offload step.** No screen, no write. A finished pickup leaves
   `tools.location` still pointing at the job site; **no pickup path writes
   `location` at all today.** That is 3C and 3D.
3. **The PM's per-tool status pick is clobbered.** Whatever the PM sets is
   overwritten by `In Transit` the moment the tools are collected, because
   `statusNew` carries both *where a tool is in the flow* and *what condition
   it is in*. This is exactly the limit `phase-2-lifecycle.md` flagged — "one
   field, two concerns… splitting into two fields is the real fix if this
   bites". It has bitten. That is 3A.

## Decisions already made

Settled with the user 2026-09-10. Don't re-litigate these.

- **Condition splits off `statusNew`** into a new `tools.condition` field, typed
  against a new `ToolCondition` option set. `statusNew` keeps flow-only values.
- **Warehouses stay pseudo-`jobs` rows**, named by a code constant. No new
  table, no option set, no migration of existing `location` strings.
- **`Returned`** is pickup's terminal `request.status`, not `Delivered`.
- **Partial pickup:** tools left behind keep `statusNew = "Pickup Requested"`
  and their job `location`; the request finishes as `Returned` with only what
  was taken. Collecting the rest means a new request.
- **3A goes first.** 3C writes `In Transit` over the PM's pick, so building
  pickup before the split means knowingly shipping data loss.
- **No new Bubble workflow anywhere in this phase.** Every write reuses
  `update-request-status` (built, live) or `create-assigned-tool` / its private
  helper `assign-request-tool`.

---

## The lifecycle

```
Delivery:  New ──assign──▶ Assigned ──dispatch──▶ In Transit ──offload──▶ Delivered
Pickup:    New ─(at create)▶ Assigned ──pickup───▶ In Transit ──return───▶ Returned
```

Pickup has **no separate assign step**: its physical tools are named at request
creation, so the request is born `Assigned`. `In Transit` is shared, which is
what lets the existing Active-trips screen carry pickups with no data change.

| Step | `request.status` | `tools.statusNew` | `tools.location` | `tools.currentUser` | `tools.condition` | Slice |
| --- | --- | --- | --- | --- | --- | --- |
| Pickup created | `Assigned` | `Pickup Requested` | job name (unchanged) | unchanged | **the PM's pick** | 3B |
| Picked up — taken | `In Transit` | `In Transit` | **the driver's name** | driver | untouched | 3C |
| Picked up — left behind | — | `Pickup Requested` | job name (unchanged) | unchanged | untouched | 3C |
| Returned at warehouse | `Returned` | `Available` | **the warehouse name** | driver (kept) | untouched | 3D |

`currentUser` is **not** cleared on return — the same rule delivery already
follows, a real record of who moved the tool.

> **Pickup is delivery's location lifecycle in reverse.** Delivery runs
> Warehouse → driver → job. Pickup runs job → driver → warehouse. The middle
> hop is byte-identical, which is why 3C reuses `dispatchRequests` verbatim
> rather than adding a function.

---

## Schema

### `tools.condition` — a third field, not a retype

The same parallel-field move already made twice in this codebase, for the same
reason: an option-set write with an unrecognised value **fails silently**, and
retyping a live field risks redefining rows an outside writer owns.

| Field | Option set | Holds | Written by |
| --- | --- | --- | --- |
| `status` | `Tool Status` (7 values) | legacy | only the old Bubble UI (`/wf/Set Status`) |
| `statusNew` | `ToolStatusNew` (10 values) | **flow state** after 3A | `update-request-status` |
| `condition` | `ToolCondition` (6 values) — **new** | **physical condition** | `update-tool-status` |

`ToolCondition`: `Ok`, `Maintenance Required`, `Repair Required`,
`Under Repair`, `Inspection Required`, `Missing`.

After 3A, `statusNew`'s five condition values (`Maintenance Required`,
`Repair Required`, `Under Repair`, `Inspection Required`, `Missing`) simply
**stop being written**. They stay in the option set — deleting option-set
values is risky and nothing needs them gone.

### `request.status` gains `Returned`

`request.status` is **text in Bubble, not an option set**, deliberately, so an
unexpected value fails loudly in Zod rather than silently on a Bubble write.
Adding a value therefore costs nothing on the Bubble side — only the code maps
have to learn it.

```ts
export const REQUEST_STATUS = ["New", "Assigned", "In Transit", "Delivered", "Returned"] as const
```

With two terminal branches the status stepper can no longer render
`REQUEST_STATUS` flat — see 3C.

### `assignedtools` — reused as-is, one convention noted

No new field. Pickup rows carry `requestID`, `toolID`, `toolType`, `extra`
exactly as delivery's do, with one thing worth stating plainly:

> **For pickup rows, `toolType` holds the physical tool's name**, not a
> `toolstype` name.

That is not a hack. `toolType`'s documented meaning is *"the `toolsSummary`
name from this request this row fills"*, and for pickup the summary entries
**are** physical tool names (`toolLinesOfPickup` maps `tool.name` with
quantity 1). `lib/schemas/assignment.ts:21-26` already records that the field
is cosmetic — "`buildSlots` groups on it, nothing resolves it back to a
`toolstype` row". So the convention holds and
`buildSlots(requestedLines, assigned, toolTypes)` lines up for pickup with
**no new logic**: "3 of 5 picked up" falls straight out of the existing
requested-vs-assigned comparison.

### Nothing else changes

No new table. No new workflow. No `request` field beyond the `status` value.
`toolshistory` keeps being written automatically by `DB - Tools Change Log` on
every `tools` save — see the caveat under Known limits.

---

## Workflows

All four writes reuse what exists. For reference, the two this phase calls:

**`update-request-status`** (built, live — spec in
[`bubble-update-request-status-spec.md`](./bubble-update-request-status-spec.md)).
Params: `requestIds` (text list), `status` (text), `driver?`, `toolIds?`
(text list), `toolStatus` (**the `ToolStatusNew` option set**, not text),
`toolLocation?`, `toolUser?`. Every optional param is guarded by an *only when
not empty* condition, which is what lets a caller change `statusNew` without
touching `location` — 3C's left-behind write depends on exactly that.

**`create-assigned-tool`** (built, live — see
[`phase-2a-assignment-handoff.md`](./phase-2a-assignment-handoff.md)). Params:
`requestId`, `assignments` (list of `{ toolId, extra, toolType }` objects, real
JSON via Detect Data). Deletes the request's existing `assignedtools` rows,
fans out `assign-request-tool`, sets `request.status = "Assigned"`, returns
`{ ok, count }`. **The delete-first step is what makes it idempotent** —
`lib/bubble/client.ts` retries a POST on 429/5xx, so a 502-after-commit would
otherwise double every row. 3C's subset replace relies on it.

Call shapes per transition:

| Transition | Workflow | Key params | Slice |
| --- | --- | --- | --- |
| Create | `new-pickup-request` | `assignments`, `toolIds` → `statusNew = "Pickup Requested"`, `status = "Assigned"` | 3B |
| Pickup (taken) | `update-request-status` via **`dispatchRequests`** | `status: "In Transit"`, `driver`, `toolStatus: "In Transit"`, `toolLocation: driver`, `toolUser: driver` | 3C |
| Pickup (left behind) | `update-request-status` | `toolStatus: "Pickup Requested"`, **no `toolLocation`** | 3C |
| Return | `update-request-status` via **`returnRequest`** | `status: "Returned"`, `toolStatus: "Available"`, `toolLocation: warehouse` | 3D |

---

## Verification across the whole phase

Each slice doc has its own checks. Once 3D lands, the end-to-end proof:

- `npm run typecheck`, `npm run build`, `npm run check-bubble`.
- One pickup request create → **partial** pickup → return, watching
  `condition` survive all three transitions untouched. That is the entire point
  of the phase.
- **Delivery regression:** assign → dispatch → complete delivery still works,
  and `isAssignable` still hides broken tools now that it reads `condition`.
- The round trip that proves the location lifecycle both ways: returned tools
  group under the warehouse on `/tools`, and `listToolsForJob(<warehouse>)`
  returns them — meaning they are offerable to the next delivery's assign
  screen.
- The requests list still renders pre-phase-2 rows with no `status` as `New`;
  the dashboard's `localStorage` location filter (`tools-dashboard:locations`)
  still restores.

**Writes hit the live database** — ~1,450 jobs and ~1,550 requests of real data
on `version-test`. Pick test rows deliberately and note them down.

---

## Known limits, carried forward

- **A request with both `delivery` and `pickup` true** has two lifecycles and
  one `status` field. The forms never create one, so this is latent, not
  broken. Out of scope.
- **Left-behind tools stay `Pickup Requested` indefinitely** if nobody
  re-requests them. No expiry, by design — the alternative was losing the
  intent to collect them silently.
- **Site-to-site is still unsupported.** During transit `location` is the
  driver's name, so `listToolsForJob` returns nothing for an in-flight load —
  the same trade delivery already makes.
- **`condition` has no audit trail** unless the optional `toolshistory` fields
  in 3A get added. `DB - Tools Change Log` snapshots `prevStatus`/`newStatus`
  and `prevStatusNew`/`newStatusNew` only.
- **Condition is captured at request time, not at inspection time.** The
  warehouse receiver cannot correct it in the return dialog — noted as
  deliberately out of scope in 3D, and the natural next slice if it matters.
- **No roles.** Any signed-in user can confirm a pickup or a return, and
  `ALLOW_DEV_LOGIN=true` "checks nothing" per `CLAUDE.md`. These steps move
  physical inventory and shouldn't reach real users while dev-login is on.
- **Stale comments.** Six code comments still claim `update-request-status`
  "isn't built yet" (`app/(app)/dispatch/page.tsx`,
  `components/dispatch-board.tsx`, `lib/bubble/assigned-tools.ts`,
  `lib/bubble/requests.ts`, `lib/bubble/enums.ts`, `scripts/check-bubble.ts`).
  It is built and live. Fix them as you touch each file.
