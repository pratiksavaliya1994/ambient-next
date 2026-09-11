# Handoff: add `toolshistory` logging to `update-request-status`

**2026-09-10 — superseded and reverted.** Everything this doc describes was
built, then found to cause duplicate `toolshistory` rows: a pre-existing,
previously-undocumented backend workflow, `DB - Tools Change Log` (Data
event, `A tools is modified`, no condition, outside this project), already
writes a `toolshistory` row on *every* `tools` save — including the ones this
handoff's new step made. With both in place, each dispatch/offload produced
two rows instead of one. The new step (and its `create-tool-history-entry`
helper) has been removed from `update-request-status`; `DB - Tools Change
Log` is now the sole writer of `toolshistory` for tool location/status
changes. See `docs/bubble-update-request-status-spec.md` for the corrected,
current state. This file is kept only as a historical record of the original
(mistaken) design — don't rebuild from it.

---

**Status: built in Bubble Studio, not yet verified.** Everything in Part 2
below has been built — two new `toolshistory` fields, the
`create-tool-history-entry` helper, and the new step — with two real
deviations from this doc's original design (both are improvements, not scope
changes; noted where relevant): the request-update step is built as two
separate steps rather than one, and the helper workflow's `tool` parameter is
a direct `Tools` reference rather than a text id. **Verification (Part 3)
has not actually been run yet** — an earlier claim that it had passed didn't
hold up against a live read of `toolshistory` (no new rows existed). The
canonical, corrected-to-match-what's-built version of this spec now lives in
`docs/bubble-update-request-status-spec.md` (and `docs/bubble-request-status-workflow.md`
§6) — treat those as authoritative for exact step numbers going forward; this
file is kept as the original standalone handoff for reference.

**This doc is self-contained.** It does not assume the reader (human or AI)
has access to the Next.js codebase — everything needed is inlined below.

**Opening line if you're pasting this to an AI assistant:** "I need to add
tool-location history logging to an existing, live Bubble.io backend
workflow. Below is the full current state of that workflow and the
`toolshistory` table, plus the exact new step/fields/helper workflow to add.
Walk me through building this in Bubble Studio, step by step, matching
exactly what's described — don't redesign it."

## Ground rules

- The Bubble app (`cfaner.bubbleapps.io`, `version-test` branch — the only
  branch in use) is **live production data**: ~1,450 jobs, ~1,550 requests,
  real customer/job records. Every write below is a real write.
- There is no API for editing Bubble Studio's schema or workflows — every
  change in this doc is **manual**, done by a human in Bubble Studio's Data
  tab and Backend Workflows editor.
- The application code (Next.js) needs **zero changes** for this. It already
  sends everything the new logic needs. This handoff is Bubble-Studio-only.

---

## Part 1 — What already exists and is already working (do not change)

### `tools` table — relevant fields

| Field | Type |
| --- | --- |
| `location` | text — a job's exact name, `"Warehouse"`, a person's name, or blank |
| `status` | option set **`Tool Status`** (old/legacy): `Ok`, `Ready for Pickup`, `To do Maintenance`, `To be Repaired`, `Repairing / Under Maintenance`, `Discharged`, `Missing` |
| `statusNew` | option set **`ToolStatusNew`** (current lifecycle): `Available`, `In Transit`, `Delivered`, `Pickup Requested`, `Maintenance Required`, `Repair Required`, `Under Repair`, `Inspection Required`, `Missing` |
| `currentUser` | text (display name, not a real user link) |
| `floor` | text |

Two separate status fields exist on purpose: `status` is written by an old,
pre-existing Bubble UI workflow outside this project's scope; `statusNew` is
the newer lifecycle field. Neither is being touched by this change.

### `request` table — relevant fields

| Field | Type |
| --- | --- |
| `status` | **text** (not option set): `New` / `Assigned` / `In Transit` / `Delivered` |
| `driver` | text |

### The `update-request-status` workflow — BUILT AND LIVE TODAY

**Confirmed live** via a read-only API check: real `request` rows exist with
`status: "Delivered"` and a `driver` name set. This workflow is actively
serving production dispatch and delivery traffic right now.

- **Endpoint:** `POST /wf/update-request-status` — an exposed API workflow,
  same auth setting as this app's other public workflows ("User & admin").

- **Current parameters** (all already exist — do not add, remove, or retype
  any of these):

  | Parameter | Type | Notes |
  | --- | --- | --- |
  | `requestIds` | text list | Required |
  | `status` | text | Required |
  | `driver` | text | Optional |
  | `toolIds` | text list | Optional |
  | `toolStatus` | **option set `ToolStatusNew`** (not text) | Optional |
  | `toolLocation` | text | Optional — sent on both dispatch and delivery-completion calls |
  | `toolUser` | text | Optional |

- **Current steps, in order, exactly as built today:**

  **Step 1 — Make changes to a list of things:**
  - List: `Search for request (unique id is in requestIds)`
  - `status` = `status`
  - `driver` = `driver`, only when `driver is not empty`

  **Step 2 — Make changes to a list of things:**
  - List: `Search for tools (unique id is in toolIds)`
  - `statusNew` = `toolStatus`, only when `toolStatus is not empty`
  - `location` = `toolLocation`, only when `toolLocation is not empty`
  - `currentUser` = `toolUser`, only when `toolUser is not empty`
  - Whole step gated on `toolIds is not empty`

  **Step 3 — Return data from API:**
  ```json
  { "ok": true, "requests": "requestIds:count", "tools": "toolIds:count" }
  ```

- **The two real callers today**, for reference when testing:

  **Dispatch** (driver picks up tools from the warehouse):
  ```
  requestIds:   [one or more request ids]
  status:       "In Transit"
  driver:       "<driver's name>"
  toolIds:      [union of every assigned tool across those requests]
  toolStatus:   "In Transit"
  toolLocation: "<driver's name>"     — same string as driver/toolUser
  toolUser:     "<driver's name>"
  ```

  **Complete Delivery / Offload** (driver drops tools at the job):
  ```
  requestIds:   [one request id]
  status:       "Delivered"
  toolIds:      [that request's assigned tools]
  toolStatus:   "Delivered"
  toolLocation: "<the job's exact name>"
  (driver / toolUser are NOT sent — tools.currentUser stays whoever dispatched it)
  ```

### The `toolshistory` table — already exists, already has real data

**Confirmed live** via a read-only API check: **~1,542 existing rows.**
Nothing in `update-request-status` writes to it today — it's written only by
two old, pre-existing Bubble workflows outside this project (`/wf/Set
Status`, `/wf/Set Location`, part of the legacy/original Bubble UI, not built
or maintained by this project). Closing that gap — logging dispatch/delivery
location changes too — is the actual goal of this handoff.

**Current schema (confirmed live):**

| Field | Type |
| --- | --- |
| `tool` | link to `tools` |
| `prevLocation` | text |
| `newLocation` | text |
| `prevLocationFloor` | text |
| `newLocationFloor` | text |
| `prevStatus` | **option set — the old `Tool Status` set** (same 7 values as `tools.status` above) |
| `newStatus` | **option set — the old `Tool Status` set** |
| `notes` | text |
| `picture` | text |
| *(system)* | `Created Date`, `Modified Date`, `Created By`, unique id, `Slug` |

**Example of a real existing row** (shape only):
```
tool: <a tools unique id>
prevLocation: "Warehouse"       newLocation: "99 Park Ave - J23-0668"
prevStatus:   "Ok"              newStatus:   "Ok"
```

**The problem this creates:** `prevStatus`/`newStatus` are locked to the old
7-value `Tool Status` option set. They do **not** include the lifecycle
values `update-request-status` actually uses (`In Transit`, `Delivered`,
`Assigned`, `Available`, etc. — the `ToolStatusNew` set). In Bubble, writing
an option-set field a value that isn't one of its defined options **fails
silently** — the field is just left blank, no error. So this workflow can't
write meaningful status into the existing `prevStatus`/`newStatus` fields.

**Decision already made — do not revisit:** don't retype `prevStatus`/
`newStatus` to the new option set either. Retyping an option-set field can
silently blank any existing value that isn't in the new set (and none of the
1,542 existing rows' old values are), which would destroy real history data.
Instead: **add two brand-new fields**, used only by the new logic, leaving
every existing field and all 1,542 rows completely untouched. This mirrors
why `tools.statusNew` itself was added as a parallel field instead of
repurposing `tools.status` — same reasoning, same fix.

---

## Part 2 — What needs to be built

### Step A — Add two new fields to `toolshistory`

Data tab → `toolshistory` type → add field:

- `prevStatusNew` — type: option set `ToolStatusNew`
- `newStatusNew` — type: option set `ToolStatusNew`

Do not touch any existing field on `toolshistory`.

### Step B — New private helper workflow: `create-tool-history-entry`

- Backend Workflows → New API Workflow, named exactly
  `create-tool-history-entry`.
- Set it to run **internal-only** — the same restrictive "This workflow can
  be run" setting this app already uses for its other private, per-item
  helper workflows (they're never called directly from outside Bubble, only
  scheduled from inside another workflow). Do **not** expose it as a public
  API endpoint.
- Parameters:

  | Parameter | Type |
  | --- | --- |
  | `toolId` | text |
  | `prevLocation` | text |
  | `newLocation` | text |
  | `prevStatusNew` | option set `ToolStatusNew` |
  | `newStatusNew` | option set `ToolStatusNew` |

- **Step 1 (only step) — Create a new `toolshistory`:**

  | Field | Value |
  | --- | --- |
  | `tool` | `toolId` |
  | `prevLocation` | `prevLocation` |
  | `newLocation` | `newLocation` |
  | `prevStatusNew` | `prevStatusNew` |
  | `newStatusNew` | `newStatusNew` |

- No "Return data from API" step — nothing reads this workflow's response.

### Step C — One new step inserted into the existing `update-request-status`

**Insert as the new Step 2** — between the current Step 1 (request update)
and the current Step 2 (tools update). Ordering is not optional: this new
step must run **before** the tools get updated, because it needs to read
each tool's `location`/`statusNew` as they are *right now*, before Step 3
(the renumbered tools-update step) overwrites them.

After inserting, the workflow reads:

- **Step 1** — unchanged, exactly as in Part 1
- **Step 2** — new (below)
- **Step 3** — the existing tools-update step, moved down one slot,
  **contents unchanged**
- **Step 4** — the existing Return step, moved down one slot, **contents and
  response shape unchanged** — `{ ok, requests, tools }` does not gain a
  history count; the new step is fire-and-forget by design (see note below)

**New Step 2 — "Schedule API Workflow on a list":**

- Type of things: `tools`
- List to run on: `Search for tools (unique id is in toolIds)` — the exact
  same search Step 3 already does
- Workflow to run: `create-tool-history-entry`
- Parameter mapping:
  - `toolId` = `This tools's unique id`
  - `prevLocation` = `This tools's location`
  - `newLocation` = `toolLocation` *(this workflow's own incoming parameter — not the tool's)*
  - `prevStatusNew` = `This tools's statusNew`
  - `newStatusNew` = `toolStatus` *(this workflow's own incoming parameter)*
- **Only when:** `toolIds is not empty` **and** `toolLocation is not empty`

That guard matters: any future caller of this workflow that changes a
status without changing a location (there's a prospective, not-yet-built use
for the "assign" step of this app that would do exactly that) won't produce
a meaningless history row where nothing about location actually changed.

**Do not** change Step 1, Step 3, Step 4, or add any new parameter to
`update-request-status` itself — the new step only reads parameters
(`toolIds`, `toolLocation`, `toolStatus`) that already exist on it.

### Why a fan-out (schedule-on-list) is fine here, even though the tools update itself isn't

The existing tools-update step (Step 3) is deliberately a single synchronous
"make changes to a list," not a fan-out, because a partial failure there
would leave some tools moved and some not with nothing reporting it — the
returned `tools` count is what catches that. A history row is different: it's
a log, not state. A slow or occasionally-failed history write shouldn't be
allowed to block or fail the real state transition, so fire-and-forget here
is the right tradeoff — it doesn't weaken the existing guarantee, since
Step 3's counts are still checked exactly as before.

---

## Part 3 — Test plan

`update-request-status` already carries real traffic — treat this as testing
an edit to a **working production workflow**, not a first build. Every run
below is a real write. Pick one test request and a small handful of test
tools deliberately, and note their ids so you can check and reset them
afterward.

1. **Regression check — no `toolIds`.** Run with just `requestIds` + `status`.
   Confirm: request row(s) change exactly as before, no `tools` row touched,
   and (new) no `toolshistory` row created.
2. **`toolIds` + `toolStatus`, no `toolLocation`.** Confirm: `tools.statusNew`
   changes as before, `tools.status`/`tools.location` untouched, and — new —
   confirm **no** `toolshistory` row was created (the `toolLocation is not
   empty` guard should block it).
3. **Add `toolLocation`.** Confirm: `tools.location` changes to the exact
   string sent, exactly as before, **and** one new `toolshistory` row now
   exists per tool with `prevLocation` equal to what that tool's `location`
   was immediately before this run, `newLocation` equal to the `toolLocation`
   you sent, `prevStatusNew`/`newStatusNew` populated, and the row's
   `prevStatus`/`newStatus`/floor fields still blank.
4. **Run the identical call again with a different `toolLocation`.** Confirm
   the tools update again (no doubling of tool state), and — the real proof
   this works — the **newest** `toolshistory` row's `prevLocation` now equals
   the `newLocation` from the *previous* run. That's what proves Step 2 is
   reading live current state each time, not something stale.
5. Only after 1–4 pass: exercise it from the real app on a test request —
   dispatch it, confirm a history row per tool; then complete delivery on it,
   confirm a second history row per tool.
