# Bubble Studio spec: `update-request-status`

A focused build sheet for the one workflow Dispatch (2B) and Offload (2C)
share. The authoritative source is `docs/bubble-request-status-workflow.md`
§6-7 (which also covers two unrelated workflows, `create-assigned-tool` and
`assign-request-tools`) — this file pulls out just the `update-request-status`
piece so it can be handed to whoever builds it in Bubble Studio without the
surrounding context.

**Status: built and live.** Both `lib/bubble/requests.ts#dispatchRequests`
(dispatch, 2B) and `lib/bubble/requests.ts#offloadRequest` (offload/complete
delivery, 2C) call it today, and real `request` rows already carry
`status: "Delivered"` with a `driver` set, confirming it's in active use.

**2026-09-10 — the `toolshistory` step (formerly Step 3 below) has been
disabled and removed.** It turned out to be redundant: there is a
pre-existing, previously-undocumented backend workflow, `DB - Tools Change
Log` (Data event, `A tools is modified`, no condition), that already fires on
*every* `tools` save and writes its own `toolshistory` row — snapshotting
`tool`, `prevLocation`/`newLocation`, `prevStatus`/`newStatus`, and
`prevStatusNew`/`newStatusNew` off `tools before change`/`tools now`. Since
this workflow's own Step 4 (tools update, renumbered to Step 3 below) edits
`tools.location`/`tools.statusNew`, `DB - Tools Change Log` fires from that
edit alone. Running the explicit `create-tool-history-entry` fan-out *as
well* produced two `toolshistory` rows per dispatch/offload instead of one —
caught by a live read of `toolshistory` showing duplicates. The fix is to
remove the explicit step and let `DB - Tools Change Log` be the only writer;
§3-5 below are kept as a historical record of what was removed and why, not
as current build instructions — see the note at the top of each.

> The `version-test` branch is the only version in use. Treat it as
> production: ~1,450 jobs, ~1,550 requests of real data. Test with rows you
> pick deliberately (see "Test before relying on it" below) — every test run
> is a real write.

---

## 1. The workflow

**Backend Workflows → API Workflow**, named `update-request-status`, exposed
as an API endpoint with the same auth setting as `new-request` ("User &
admin").

This one workflow serves three transitions — dispatch, offload, and assign's
tool-status half (2A, prospective — the current `create-assigned-tool`
workflow doesn't call this yet). Every optional parameter is guarded, so a
caller sends only the fields it means to change.

## 2. Parameters

| Parameter | Type | Notes |
| --- | --- | --- |
| `requestIds` | text **list** | Required |
| `status` | text | Required |
| `driver` | text | Optional |
| `toolIds` | text **list** | Optional |
| `toolStatus` | **the `ToolStatusNew` option set** | Not text — see below |
| `toolLocation` | text | Optional. Sent on **both** dispatch (the driver's name) and offload (the job's `name`) — see §5 |
| `toolUser` | text | Optional |

`toolStatus` is declared as the **`ToolStatusNew` option set type itself** —
not text, and not the original `Tool Status` set. Bubble then matches the
incoming display text and raises an error on a bad value. Declaring it as text
and converting later reproduces the Data API's "an unrecognised option-set
value fails silently" behaviour, which this design can't afford.

## 3. Two fields on `toolshistory` (still in place — now written by `DB - Tools Change Log`, not this workflow)

*(Historical: these fields were added for the `create-tool-history-entry`
step below, which has since been removed — see the 2026-09-10 note above.
The fields stay, since `DB - Tools Change Log` populates them on every
`tools` edit regardless of which workflow made it.)*

`toolshistory` already exists and is **not empty** — ~1,542 real rows, written
by the pre-existing `/wf/Set Status` / `/wf/Set Location` workflows (the old
Bubble UI). Its confirmed live schema:

| Field | Type |
| --- | --- |
| `tool` | link to `tools` |
| `prevLocation`, `newLocation` | text |
| `prevLocationFloor`, `newLocationFloor` | text |
| `prevStatus`, `newStatus` | option set — the original `Tool Status` set (`Ok`, `Ready for Pickup`, `To be Repaired`, …) |
| `notes` | text |
| `picture` | text |

`prevStatus`/`newStatus` hold the **old** `Tool Status` vocabulary, which
doesn't include the phase-2 lifecycle values this workflow writes (`In
Transit`, `Delivered`, from `tools.statusNew`/`ToolStatusNew`). Writing those
into the existing fields would fail silently (wrong option set), and retyping
the fields risks blanking the 1,542 existing rows' values. So: **add two new
fields instead, don't touch the existing ones** — the same "parallel field,
not a retype" move already made for `tools.statusNew` itself:

- `prevStatusNew` — option set `ToolStatusNew`
- `newStatusNew` — option set `ToolStatusNew`

`prevLocationFloor`/`newLocationFloor`/`notes`/`picture` stay blank on rows
this workflow creates — floor isn't touched by dispatch/offload, and `notes`
is for exceptional annotations (e.g. the existing "Ignition key not working"
row), not routine transitions.

## 4. Removed: private helper workflow `create-tool-history-entry`

*(Historical — this helper and the step that called it, below, were removed
on 2026-09-10. Kept here only as a record of what used to exist; delete the
workflow in Bubble Studio if it's still there, it's dead.)*

Same shape as the existing per-item helpers (`assign-request-tool`,
`update-tool-status`) — internal-only, same "This workflow can be run" setting
as those, **not** exposed as a public API endpoint.

**As built, `tool` is a direct `Tools` parameter, not a text id** — an
optimization over the original design (which passed a text `toolId` and
required a `Search for Tools (unique id = toolId)` inside this helper just to
get a usable thing back). Passing the thing itself means this helper does no
searching at all:

Parameters:

| Parameter | Type |
| --- | --- |
| `tool` | **Tools** (a direct thing reference, not text) |
| `prevLocation` | text |
| `newLocation` | text |
| `prevStatusNew` | the `ToolStatusNew` option set |
| `newStatusNew` | the `ToolStatusNew` option set |

**Step 1 — Create a new `toolshistory`:**

| Field | Value |
| --- | --- |
| `tool` | `tool` |
| `prevLocation` | `prevLocation` |
| `newLocation` | `newLocation` |
| `prevStatusNew` | `prevStatusNew` |
| `newStatusNew` | `newStatusNew` |

No **Return data from API** step — nothing reads this workflow's response,
matching its siblings.

## 5. Steps in `update-request-status`

**As built, the request update is two separate steps** (not one step setting
two fields) — Bubble's "make changes to a list" doesn't support a per-field
"only when" the way a single combined step would need for `driver`, so
`status` and `driver` were split out. **As of 2026-09-10, four steps total**
— the former Step 3 (`create-tool-history-entry` fan-out) has been removed;
see the note at the top of this doc:

**Step 1 — Make changes to a list of things:**

- List: `Search for request (unique id is in requestIds)`
- `status` = `status`

**Step 2 — Make changes to a list of things:**

- List: `Search for request (unique id is in requestIds)`
- `driver` = `driver`, **only when** `driver is not empty`

**Step 3 — Make changes to a list of things:** *(unchanged; was Step 4)*

- List: `Search for tools (unique id is in toolIds)`
- **`statusNew`** = `toolStatus`, **only when** `toolStatus is not empty` — the
  new field, **not** `status` (the original `tools.status` field stays
  untouched; see `docs/phase-2-lifecycle.md` for why the two fields coexist)
- `location` = `toolLocation`, **only when** `toolLocation is not empty`
- `currentUser` = `toolUser`, **only when** `toolUser is not empty`
- Gate the whole step on `toolIds is not empty`

This step's edit to `tools` is what triggers `DB - Tools Change Log` (the
data-event workflow, outside this project, that fires on `A tools is
modified`) — that workflow is now the sole writer of the `toolshistory` row
for this transition, with no extra step needed here to make it happen.

**Step 4 — Return data from API:** *(unchanged; was Step 5)*

```json
{ "ok": true, "requests": "requestIds:count", "tools": "toolIds:count" }
```

The Next.js side (`dispatchRequests`/`offloadRequest`) Zod-parses
`{ requests, tools }` and compares the counts against what it sent — a
`requests` mismatch throws, a `tools` mismatch surfaces as a non-fatal
warning. The response shape is unchanged — history rows aren't counted here,
same fire-and-forget tolerance as `update-tool-status`'s fan-out below.

### Why Step 3 (tools update) stays a synchronous list-change, not a fan-out

`update-tool-status` (the Pickup flow's workflow) fans out because every tool
gets a *different* status. Here every tool in one transition shares one
destination, so a single synchronous list-change does it — and the caller
gets a real count back. Its own fan-out is deliberately fire-and-forget ("a
slow or failed individual `tools` update never blocks or fails the request
creation itself") — tolerable for a pickup *status* ping, not tolerable for
the *location* lifecycle, where a half-applied dispatch would leave some tools
moved and some not, the request claiming otherwise, with nothing anywhere
reporting it.

## 6. Call shapes by transition

**Dispatch (2B — built, live):**

| Parameter | Value |
| --- | --- |
| `requestIds` | the selected requests |
| `status` | `"In Transit"` |
| `driver` | the picked driver's name |
| `toolIds` | union of `assignedtools.toolID` across those requests |
| `toolStatus` | `"In Transit"` |
| `toolLocation` | **the driver's name** — same string as `driver`/`toolUser`. `location` means "current place or custodian," so a tool in transit reads as being with whoever has it, not still at its pre-dispatch place. See `docs/phase-2-lifecycle.md`. |
| `toolUser` | the driver's name |

**Offload (2C — built, live):**

| Parameter | Value |
| --- | --- |
| `requestIds` | `[requestId]` (one request) |
| `status` | `"Delivered"` |
| `driver` | not sent |
| `toolIds` | that request's assigned tools |
| `toolStatus` | `"Delivered"` |
| `toolLocation` | the job's `name`, exactly |
| `toolUser` | not sent — kept as whatever dispatch set, a record of who moved it |

**Assign's tool-status half — decided against, not just deferred.** The
original plan had assign/unassign call this workflow too: `toolIds` = the
newly-assigned tools with `toolStatus: "Assigned"`, and separately the tools a
save *dropped* with `toolStatus: "Available"`. `request.status` is still set
to `Assigned` by `create-assigned-tool` itself, unaffected — only this
tool-status call was ever missing, and it isn't being built. Reason: a tool
can be legitimately assigned to a *future* request while it's currently
mid-flow on a different one (`In Transit`, `Delivered` elsewhere, `Pickup
Requested`), and writing `Assigned`/`Available` at assign/unassign time would
clobber that real current state. The `assignedtools` row already fully
records the commitment and is what the date-overlap availability check reads
— `tools.statusNew` doesn't need to reflect it too. See
`docs/phase-2-lifecycle.md`'s Assign/Unassign note.

## 7. Test before relying on it

`update-request-status` already carries real traffic, so test any edit here
as an edit to a **working workflow**, not a first build. Do these in Bubble
Studio's **Run** / test feature (or Postman against the real endpoint),
against a request and a handful of tools picked deliberately — note which
ones so they can be checked and put back. Every run below is a real write to
the live database. After each write, confirm the result by reading
`toolshistory` back (e.g. `GET /obj/toolshistory?sort_field=Created Date&descending=true&limit=5`) rather than assuming it worked.

1. **Regression check — `requestIds` + `status` only, no `toolIds`.** Confirm
   the request rows change and no `tools` row does — and, since nothing
   touched `tools`, `DB - Tools Change Log` doesn't fire either, so no
   `toolshistory` row appears.
2. **Add `toolIds` + `toolStatus` (+ optionally `toolLocation`).** Confirm the
   tools' `statusNew`/`location` change as expected, and — the point of this
   whole change — exactly **one** new `toolshistory` row per tool appears,
   not two, with `prevLocation`/`newLocation` and `prevStatusNew`/
   `newStatusNew` populated correctly off `DB - Tools Change Log`'s
   before/after read.
3. **Run the same call again with a different `toolLocation`.** Confirm the
   tools update to the new value as before (no doubling), and the *newest*
   `toolshistory` row's `prevLocation` equals the *previous* run's
   `newLocation`.
4. Only then let the Next.js Dispatch board and Complete Delivery action call
   it for real — though for dispatch/offload themselves that's already
   happening; this step is really about confirming the duplicate is actually
   gone on a real row, not just in theory.
