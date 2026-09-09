# Bubble Studio spec: `update-request-status`

A focused build sheet for the one workflow Dispatch (2B) needs. The
authoritative source is `docs/bubble-request-status-workflow.md` §6-7 (which
also covers two unrelated workflows, `create-assigned-tool` and
`assign-request-tools`) — this file pulls out just the `update-request-status`
piece so it can be handed to whoever builds it in Bubble Studio without the
surrounding context.

**Status: not built yet.** The Next.js side already calls it —
`lib/bubble/requests.ts#dispatchRequests`, called from
`app/(app)/dispatch/actions.ts#dispatchAction` — and will fail with a visible
"Bubble rejected the dispatch" error until this exists.

> The `version-test` branch is the only version in use. Treat it as
> production: ~1,450 jobs, ~1,550 requests of real data. Test with rows you
> pick deliberately (see "Test before relying on it" below) — every test run
> is a real write.

---

## 1. Create the workflow

**Backend Workflows → New API Workflow**, named exactly
`update-request-status`. Expose it as an API endpoint with the same auth
setting as `new-request` ("User & admin").

This one workflow is designed to serve three transitions — dispatch (built,
consuming it now), offload (2C, not started), and assign's tool-status half
(2A, prospective — the current `create-assigned-tool` workflow doesn't call
this yet). Every optional parameter is guarded, so a caller sends only the
fields it means to change.

## 2. Parameters

| Parameter | Type | Notes |
| --- | --- | --- |
| `requestIds` | text **list** | Required |
| `status` | text | Required |
| `driver` | text | Optional |
| `toolIds` | text **list** | Optional |
| `toolStatus` | **the `ToolStatusNew` option set** | Not text — see below |
| `toolLocation` | text | Optional. Sent on **both** dispatch (the driver's name) and offload (the job's `name`) — see §4 |
| `toolUser` | text | Optional |

Declare `toolStatus` as the **`ToolStatusNew` option set type itself** in the
parameter definition — not text, and not the original `Tool Status` set.
Bubble then matches the incoming display text and raises an error on a bad
value. Declaring it as text and converting later reproduces the Data API's
"an unrecognised option-set value fails silently" behaviour, which this design
can't afford — a silently-dropped tool status on dispatch is exactly the
failure mode it exists to prevent.

## 3. Steps

**Step 1 — Make changes to a list of things:**

- List: `Search for request (unique id is in requestIds)`
- `status` = `status`
- `driver` = `driver`, **only when** `driver is not empty`

**Step 2 — Make changes to a list of things:**

- List: `Search for tools (unique id is in toolIds)`
- **`statusNew`** = `toolStatus`, **only when** `toolStatus is not empty` — the
  new field, **not** `status` (the original `tools.status` field stays
  untouched; see `docs/phase-2-lifecycle.md` for why the two fields coexist)
- `location` = `toolLocation`, **only when** `toolLocation is not empty`
- `currentUser` = `toolUser`, **only when** `toolUser is not empty`
- Gate the whole step on `toolIds is not empty`

**Step 3 — Return data from API:**

```json
{ "ok": true, "requests": "requestIds:count", "tools": "toolIds:count" }
```

The Next.js side (`dispatchRequests`) Zod-parses `{ requests, tools }` and
compares `requests` against what it sent — a mismatch throws, since a partial
move across requests is not safe to ignore. A `tools` mismatch is surfaced as
a non-fatal warning instead, since the requests still moved correctly.

### Why a synchronous list-change, not `Schedule API Workflow on a list`

`update-tool-status` (the Pickup flow's workflow) fans out because every tool
gets a *different* status. Here every tool in one transition shares one
destination, so a single synchronous list-change does it — and the caller
gets a real count back. `docs/bubble-pickup-tool-status-workflow.md` §3 notes
its own fan-out is deliberately fire-and-forget ("a slow or failed individual
`tools` update never blocks or fails the request creation itself") —
tolerable for a pickup *status* ping, not tolerable for the *location*
lifecycle, where a half-applied dispatch would leave some tools moved and some
not, the request claiming otherwise, with nothing anywhere reporting it.

## 4. Call shapes by transition

**Dispatch (2B — built, calling this today):**

| Parameter | Value |
| --- | --- |
| `requestIds` | the selected requests |
| `status` | `"In Transit"` |
| `driver` | the picked driver's name |
| `toolIds` | union of `assignedtools.toolID` across those requests |
| `toolStatus` | `"In Transit"` |
| `toolLocation` | **the driver's name** — same string as `driver`/`toolUser`. `location` means "current place or custodian," so a tool in transit reads as being with whoever has it, not still at its pre-dispatch place. See `docs/phase-2-lifecycle.md`. |
| `toolUser` | the driver's name |

**Offload (2C — not started):**

| Parameter | Value |
| --- | --- |
| `requestIds` | `[requestId]` (one request) |
| `status` | `"Delivered"` |
| `driver` | not sent |
| `toolIds` | that request's assigned tools |
| `toolStatus` | `"Delivered"` |
| `toolLocation` | the job's `name`, exactly |
| `toolUser` | not sent — kept as whatever dispatch set, a record of who moved it |

**Assign's tool-status half (2A — prospective, not wired):** would send
`toolIds` = the newly-assigned tools with `toolStatus: "Assigned"`, and
separately the tools a save *dropped* with `toolStatus: "Available"`. Not part
of this build — `request.status` is already set to `Assigned` by
`create-assigned-tool` itself; only the `tools.statusNew` write is missing.

## 5. Test before relying on it

Do these in Bubble Studio's **Run** / test feature, against a request and a
handful of tools picked deliberately — note which ones so they can be checked
and put back. Every run below is a real write to the live database.

1. **`requestIds` + `status` only** — confirm the request rows changed and
   **no** `tools` row did.
2. **Add `toolIds` + `toolStatus`, no `toolLocation`** — confirm the tools'
   **`statusNew`** changed, their original `status` field is **untouched**,
   and their `location` is **untouched**, not blanked. That's what the "only
   when not empty" guards are for.
3. **Add `toolLocation`** — confirm `location` now holds the exact job name
   string.
4. **Run the same call twice** — since this is a plain field-set rather than a
   create, running it again should leave the same end state, not double
   anything.
5. Only then let the Next.js Dispatch board call it for real.
