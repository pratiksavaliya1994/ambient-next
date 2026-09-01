# Bubble Studio setup: phase 2 schema + the status workflows

Everything phase 2 needs on the Bubble side, in the order to build it. The
design and the reasoning live in [`phase-2-lifecycle.md`](./phase-2-lifecycle.md);
this is the build sheet.

**Do the read-only spike first** (`npm run check-bubble`, see
[`phase-2a-assignment.md`](./phase-2a-assignment.md) step 1). Section 1 below
changes an option set that live rows point at — go in knowing what's there.

> The `version-test` branch is the only version in use. Treat it as production:
> ~1,450 jobs, ~1,550 requests of real data.

---

## 1. The `ToolStatusNew` option set and the `statusNew` column — **as built**

> This section originally called for renaming the existing Tool Status option
> set in place. **That is not what was done.** The user built a parallel field
> instead, which is the safer call and is now the design: `tools.status` and its
> option set are live, and the old Bubble UI's `/wf/Set Status` writes them from
> outside this app. A rename would have moved that writer's rows too.

Already in place:

- Option set **`ToolStatusNew`**, holding all ten values: `Available`,
  `Assigned`, `In Transit`, `Delivered`, `Pickup Requested`,
  `Maintenance Required`, `Repair Required`, `Under Repair`,
  `Inspection Required`, `Missing`.
- Field **`tools.statusNew`**, typed as that option set.

Nothing is renamed and nothing is deleted. `tools.status` keeps its original
seven values and its existing writers — the Pickup picker in this app, and
`/wf/Set Status` in the old UI — with no collision, because phase 2 writes only
`statusNew`.

**Two consequences to carry forward:**

- **`statusNew` is empty on every existing row**, so the assignment condition
  filter (`isAssignable` in `lib/bubble/enums.ts`, which reads `statusNew`
  only) currently excludes nothing — a tool whose old `status` says
  `To be Repaired` *is* offered. The date-overlap check is unaffected and
  remains the real guard against a double-booking. Backfilling `statusNew` from
  `status` is what closes this, whenever it's worth doing.
- **"Where is grinder #7" has two answers** until the old field is retired.
  Deferred deliberately: the Tools dashboard and Pickup picker still read and
  write `status`, unchanged, and move over in a later pass.

## 2. Add the `assignedtools` type

Data tab → New type, named exactly `assignedtools`.

| Field | Type | Notes |
| --- | --- | --- |
| `requestID` | text | The `request._id` as **text**, not a link — same non-referential pattern as `requestedtools.requestID` |
| `toolID` | text | The `tools._id` as text |
| `toolType` | text | The `toolstype` **name** this tool fills |
| `extra` | yes/no | True when the tool wasn't requested |

Privacy rules: match `requestedtools` exactly. The Next.js app reads and writes
this with the admin token.

## 3. Add two fields to `request`

| Field | Type | Notes |
| --- | --- | --- |
| `status` | **text** | Not an option set. Holds `New` / `Assigned` / `In Transit` / `Delivered` |
| `driver` | **text** | Unused until phase 2B; added now to avoid a second trip |

**Check first that `request` has no `status` field already.** `CLAUDE.md`
counts 24 business fields and the known list accounts for all 24, but confirm
in the Data tab before adding.

Leave every existing row's `status` empty — the app reads empty as `New`.

## 4. Helper workflow: `create-assigned-tool`

**Backend Workflows → New API Workflow**, named exactly
`create-assigned-tool`. Same "This workflow can be run" setting as
`update-tool-status`, since it is only ever triggered from inside another
backend workflow.

Parameters:

| Parameter | Type |
| --- | --- |
| `entry` | text |
| `requestId` | text |

`entry` arrives as one `"{toolID}::{extra 0|1}::{toolType}"` string.

**Step 1 — Create a new `assignedtools`:**

| Field | Value |
| --- | --- |
| `requestID` | `requestId` |
| `toolID` | `entry:split by "::":item #1` |
| `extra` | `entry:split by "::":item #2 is "1"` |
| `toolType` | `entry:split by "::":item #3` |

The tool's id is deliberately **item #1**. `toolType` is a `toolstype` name and
live names contain colons, so if one ever contained a literal `::` only the
cosmetic label at the end could be truncated — never the tool identity. The
Next.js encoder also normalises `::` → `:` in `toolType` before sending.

No **Return data from API** step — nothing reads this workflow's response.

## 5. Public workflow: `assign-request-tools`

> **Superseded — built differently.** The as-built public endpoint is named
> **`create-assigned-tool`** and takes `assignments` as a list of objects
> (Bubble Detect Data), not `::`-delimited texts. See
> [`phase-2a-assignment-handoff.md`](./phase-2a-assignment-handoff.md) for what
> actually exists; this section is kept as the original build sheet.

**Backend Workflows → New API Workflow**, named exactly
`assign-request-tools`. Expose it as an API endpoint with the same auth setting
as `new-request` ("User & admin").

Parameters:

| Parameter | Type | Notes |
| --- | --- | --- |
| `requestId` | text | |
| `assignments` | text **list** | Tick "This input is a list". Each item is one `"{toolID}::{extra 0\|1}::{toolType}"` string |

**Step 1 — Delete a list of things.**
List to delete: `Search for assignedtools (requestID = requestId)`.

This is what makes the workflow **idempotent**, and it is not optional.
`lib/bubble/client.ts` retries a POST on 429 and 5xx up to four times, so a
502-after-commit would otherwise create every row twice. Saving an assignment
always replaces the request's rows wholesale.

**Step 2 — Schedule API Workflow on a list.**

- Type of things: `text`
- List to run on: `assignments`
- Workflow to run: `create-assigned-tool`
- `entry` = `This text`
- `requestId` = `requestId`
- **Only when:** `assignments is not empty` — same defensive gating the
  `requestedtools` step in `new-request` uses. Saving an empty assignment then
  becomes "delete the rows and set the status", which is correct.

**Step 3 — Make changes to a thing:**
`Search for request (unique id = requestId):first item` → `status` = `Assigned`.

**Step 4 — Return data from API:** `{ ok: true, count: assignments:count }`.

The Next.js side Zod-parses this. A count that doesn't match what was sent is
how a partial create is detected — the fix is to save again, which step 1 makes
safe.

## 6. Public workflow: `update-request-status`

**Backend Workflows → New API Workflow**, named exactly
`update-request-status`. Same auth setting as `new-request`.

This one workflow serves assign (tool statuses), dispatch and offload. Every
optional parameter is guarded, so a caller sends only the fields it means to
change.

Parameters:

| Parameter | Type | Notes |
| --- | --- | --- |
| `requestIds` | text **list** | |
| `status` | text | |
| `driver` | text | Optional |
| `toolIds` | text **list** | Optional |
| `toolStatus` | **the `ToolStatusNew` option set** | Not text — see below |
| `toolLocation` | text | Optional. Only sent on offload |
| `toolUser` | text | Optional |

Declare `toolStatus` as the **`ToolStatusNew` option set type itself** in the
parameter definition — not text, and not the original Tool Status set. Bubble
then matches the incoming display text and a bad value raises an error.
Declaring it as text and converting later reproduces the Data API's behaviour,
where an unrecognised option-set value **fails silently** — which is exactly the
failure this design can't afford.

**Step 1 — Make changes to a list of things:**

- List: `Search for request (unique id is in requestIds)`
- `status` = `status`
- `driver` = `driver`, **only when** `driver is not empty`

**Step 2 — Make changes to a list of things:**

- List: `Search for tools (unique id is in toolIds)`
- **`statusNew`** = `toolStatus`, **only when** `toolStatus is not empty`.
  The new field, **not** `status` — leaving the original untouched is the whole
  point of §1
- `location` = `toolLocation`, **only when** `toolLocation is not empty`
- `currentUser` = `toolUser`, **only when** `toolUser is not empty`
- Gate the whole step on `toolIds is not empty`

**Step 3 — Return data from API:**
`{ ok: true, requests: requestIds:count, tools: toolIds:count }`.

> **Why this is not a `Schedule API Workflow on a list` like
> `update-tool-status` is.** That one fans out because every tool gets a
> *different* status. Here every tool in one transition shares one destination,
> so a single synchronous list-change does it — and the caller learns whether it
> worked. `bubble-pickup-tool-status-workflow.md` §3 notes its fan-out is
> deliberately fire-and-forget: "a slow or failed individual `tools` update
> never blocks or fails the request creation itself." Tolerable for a pickup
> *status*. Not tolerable for the *location* lifecycle, where a half-applied
> dispatch leaves some tools moved and some not, the request claiming otherwise,
> and nothing anywhere reporting it.

## 7. Test before relying on it

Do these in Bubble Studio's **Run** / test feature, against rows you pick
deliberately, before the Next.js side calls anything.

1. **`create-assigned-tool` alone** — one `entry` built from a real `tools._id`
   and a real `toolstype` name, and a real `request._id`. Confirm one
   `assignedtools` row appears with all four fields correct, `extra` included.
2. **`assign-request-tools` with 2–3 assignments** — confirm the rows appear,
   `request.status` reads `Assigned`, and the returned `count` matches.
3. **Run the exact same call again.** The row count must stay the same, not
   double. This is the idempotency check and the one most worth doing.
4. **Run it with `assignments` empty** — the request's rows should be deleted,
   `status` still set, and no `create-assigned-tool` runs scheduled.
5. **`update-request-status` with only `requestIds` + `status`** — confirm the
   request rows changed and **no** `tools` row did.
6. **Again with `toolIds` + `toolStatus`, and no `toolLocation`** — confirm the
   tools' **`statusNew`** changed, their original `status` is **untouched**, and
   their `location` is **untouched**, not blanked. That is what the "only when
   not empty" guards are for.
7. **Again with `toolLocation` set** — confirm `location` now holds the exact
   job name string.
8. Only then wire up the Next.js side.

Every one of these is a real write to the live `version-test` database. Pick
one request and a handful of tools, and note which ones so they can be checked
and put back.
