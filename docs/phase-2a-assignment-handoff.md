# Phase 2A Assignment Backend — Handoff for Claude Code

**Purpose:** the Bubble side of Phase 2A (tool assignment) has been built and
tested manually via Postman. It diverges from `docs/phase-2a-assignment.md`
in several places. This document is the authoritative as-built reference —
where it conflicts with `phase-2a-assignment.md`, **this document wins**.

---

## Read this first — deviations from the original plan

| # | `phase-2a-assignment.md` said | What was actually built | Why the code needs to change |
|---|---|---|---|
| 1 | Rename `tools.status` option set in place (`Ok`→`Available` etc.), keep the same field | **A new, parallel option set and field were built instead**: option set `ToolStatusNew` (10 values, same mapping), new field `tools.statusNew`. The original `status` field and its option set are **untouched** and still live — the old Bubble UI's `/wf/Set Status` continues to write `status` with zero collision risk. | Every reference in `enums.ts`, `tools-dashboard.tsx`, and the pickup picker to a renamed `status` needs to instead read/write the **new field `statusNew`**, typed against the **new option set `ToolStatusNew`**. Do not touch `tools.status` anywhere in this phase. |
| 2 | `statusNew` starts empty on every row (per `bubble-request-status-workflow.md` §1) | **`statusNew` has since been backfilled** from `status` via a one-time manual migration (temporary Bubble button, now removed). Every `tools` row should have a non-empty `statusNew`. | `isAssignable`-style filters on `statusNew` will now behave correctly out of the box — no need to special-case empty `statusNew` as "assume assignable." If you find rows with empty `statusNew` during testing, flag it — that's a data gap, not expected behavior. |
| 3 | Public/outer workflow named `assign-request-tools`; private/inner helper named `create-assigned-tool` | **Names are swapped from the doc's convention.** The actual public endpoint is named **`create-assigned-tool`**. The actual private per-item helper is named **`assign-request-tool`** (singular). | Any workflow-name constant in `lib/bubble/assigned-tools.ts` must point at the literal string `"create-assigned-tool"` — not `"assign-request-tools"`. Do not call `assign-request-tool` (singular) directly from Next.js; it's the internal helper. |
| 4 | `assignments` sent as a **text list** of `"{toolId}::{extra 0\|1}::{toolType}"` strings (§5), built by a new `lib/bubble/assignment-entries.ts` encoder (Step 3 of the plan) | **Bubble's Detect Data feature was used instead.** `create-assigned-tool` accepts `assignments` as a **real JSON array of objects**: `[{ "toolId": string, "extra": boolean, "toolType": string }, ...]`. No delimiter encoding of any kind. | **Skip Step 3 of the original plan entirely** — do not create `lib/bubble/assignment-entries.ts` or a `formatAssignments` function. There is nothing to encode. Send the `AssignmentEntry[]` array as-is in the JSON body. |
| 5 | `update-request-status` workflow built alongside the other two (§6) | **Not built. Explicitly deferred to a later phase.** | Do not implement `updateRequestStatus()` calls yet, and do not wire the tool-status side-effects of assignment (steps that would flip `statusNew` to `Assigned`/`Available`). See "Deferred" section below for what this means for `assignToolsAction`. |

---

## Current Bubble state (as-built, confirmed via Postman testing)

### Schema

- Option set **`ToolStatusNew`** — 10 values: `Available`, `Pickup Requested`,
  `Maintenance Required`, `Repair Required`, `Under Repair`, `Missing`,
  `Assigned`, `In Transit`, `Delivered`, `Inspection Required`. (No
  `Discharged` value — confirmed zero live rows had that status, so it was
  omitted rather than carried over.)
- Field **`tools.statusNew`**, typed as `ToolStatusNew`. Backfilled from the
  old `status` field. Old `status` field and its original 7-value option set
  are untouched and still written by the old UI.
- Type **`assignedtools`** — fields `requestID` (text), `toolID` (text),
  `toolType` (text), `extra` (yes/no). Privacy rules copied from
  `requestedtools`.
- Fields **`request.status`** (text) and **`request.driver`** (text). Both
  blank on all existing rows — app should treat blank `status` as `"New"`.

### Workflow: `create-assigned-tool` (public, POST, User & admin auth)

**Parameters** (Detect-Data-defined):

| Key | Type |
|---|---|
| `requestId` | text |
| `assignments` (list) | Request Data assignments — each item has `toolId` (text), `extra` (yes/no), `toolType` (text) |

**Steps, in order:**

1. Delete a list of things — `Search for assignedtools (requestID = requestId)`. This is the idempotency guarantee; confirmed via Postman that re-sending an identical payload does not duplicate rows.
2. Schedule API Workflow `assign-request-tool` on a list — type of things `Request Data assignments`, list = `assignments`, mapping `This Request Data assignments's toolId/extra/toolType` straight onto the helper's scalar params.
3. Make changes to a thing — `Search for request (unique id = requestId):first item` → `status = "Assigned"`.
4. Return data from API — `{ ok: true, count: <number> }`, where `count` is `assignments:count`.

**Response shape:**
```json
{ "ok": true, "count": 2 }
```

### Workflow: `assign-request-tool` (private helper — NOT publicly exposed)

**Parameters:** `requestId` (text), `toolId` (text), `extra` (yes/no), `toolType` (text).

**Steps:** Create a new `assignedtools` with `requestID = requestId`, `toolID = toolId`, `extra = extra`, `toolType = toolType`.

⚠️ **Verify before relying on this in production:** confirm "Expose as a public API workflow" is unchecked on this workflow. It was flagged as needing to be turned off; final confirmation of that change wasn't explicitly verified in the handoff conversation. Check this in Bubble Studio before wiring anything, since if it's still exposed, a caller could hit it directly and bypass the delete-first idempotency step entirely.

### Confirmed via manual Postman testing against `version-test`

- Baseline call with 2 assignments (`extra: true` and `extra: false`) creates 2 correct `assignedtools` rows and sets `request.status = "Assigned"`.
- Re-sending the identical payload does **not** duplicate rows (delete-first step works).
- `toolID`/`toolType` are plain text fields, not links — no referential validation against the real `tools` table happens at this workflow. (Real tool IDs should still be used from the Next.js side in production, obviously — the test payload used placeholder IDs.)

---

## What to build in Next.js now (scoped down from the original plan)

Follow `phase-2a-assignment.md` Steps 4, 6, and 7 — with these adjustments:

- **Skip Step 3** (`lib/bubble/assignment-entries.ts` / `formatAssignments`) entirely — see deviation #4 above.
- **Step 4** (`lib/schemas/assignment.ts`) — build as specified. The schema shape (`requestId` + `assignments: { toolId, extra, toolType }[]`, with the no-duplicate-toolId refine) is unchanged; only the wire encoding changes, and that's a Step 5 concern, not a schema concern.
- **Step 5** (`lib/bubble/assigned-tools.ts`) — simplified from the original spec: no encoding step is needed. `assignTools(requestId, entries)` should call the `create-assigned-tool` workflow, sending `entries` as-is (a real JSON array of `{toolId, extra, toolType}` objects) rather than building any delimited string. The workflow name constant should point at the literal string `"create-assigned-tool"`. The response should be parsed for a `count` field and compared against `entries.length` to detect a partial fan-out — a mismatch means the write should be treated as failed.

  Do **not** implement `updateRequestStatus()` yet — that workflow doesn't exist in Bubble. See "Explicitly deferred" below.

  **Example request sent to `create-assigned-tool`:**
  ```json
  {
    "requestId": "1683b2f9a7c1e4d5",
    "assignments": [
      { "toolId": "1683a1c2b3d4e5f6", "extra": false, "toolType": "Hammer" },
      { "toolId": "1683a1c2b3d4e6a0", "extra": true, "toolType": "Impact Drill" }
    ]
  }
  ```

  **Example response:**
  ```json
  { "ok": true, "count": 2 }
  ```

- **Step 6** (`assign/actions.ts`) — build `assignToolsAction` per the original sequence (auth check, schema validate, `getRequest`, re-check `listTakenToolIds`, diff against current assignments for `dropped`), but **stop after the `assignTools()` call**. Do not add the follow-up `updateRequestStatus(...)` calls for setting tool statuses to `Assigned`/`Available` — that logic has no backend to call yet. `revalidatePath` still applies after the `assignTools()` write.

- **Step 7** (wiring `assign-tools-panel.tsx`) — build exactly as specified. This doesn't depend on the deferred workflow at all; Save should work end-to-end for creating/replacing `assignedtools` rows and setting `request.status`, it just won't yet flip any tool's `statusNew`.

---

## Explicitly deferred — do not build yet

- `updateRequestStatus()` in `lib/bubble/assigned-tools.ts` and any caller of it.
- The two follow-up calls in `assignToolsAction` that would set `toolStatus` to `Assigned` (for newly assigned tools) or `Available` (for `dropped` tools). Until `update-request-status` exists in Bubble, saving an assignment will **not** change any tool's `statusNew` — only `assignedtools` rows and `request.status` change. Tools dashboard / pickup picker behavior driven by `statusNew` will not reflect assignment state yet. This is expected and correct for this pass, not a bug to chase.
- `lib/bubble/enums.ts` updates specific to `TOOL_STATUS`/`UNASSIGNABLE_TOOL_STATUS` should point at `statusNew`/`ToolStatusNew` wherever the code reads a tool's assignment-relevant status — but since no code path writes `statusNew` yet from Next.js, treat this as read-only wiring for now.

## When `update-request-status` is eventually built

`update-request-status` **was** built (it now serves dispatch/2B and
offload/2C — see `docs/bubble-update-request-status-spec.md`), but the
assign/unassign tool-status calls described above were **decided against**,
not merely deferred: a tool can be legitimately assigned to a future request
while genuinely mid-flow on a different one, and flipping `statusNew` at
assign/unassign time would clobber that real current state for no
operational benefit. `assignToolsAction` stays as it is — `assignedtools` +
`request.status` only, `statusNew` never touched by assign/unassign. See the
Assign/Unassign note in `docs/phase-2-lifecycle.md`.

---

## As implemented in Next.js (2026-09-01)

The code now matches everything above. What landed, against the deviations:

- `lib/bubble/assignment-entries.ts` **deleted**. `AssignmentEntry` moved to
  `lib/bubble/assigned-tools-types.ts` (client-safe, so the panel can import
  the type); there is no encoder.
- `assignTools()` posts `{ requestId, assignments: entries }` to
  `create-assigned-tool` and compares the returned `count` to `entries.length`.
- `updateRequestStatus()` **removed** from `assigned-tools.ts`, along with both
  calls in `assignToolsAction` and the `dropped` diff that fed them. A comment
  at that spot in `assign/actions.ts` names what goes back there.
- `CandidateTool.status` now carries **`statusNew`**, so the assign screen shows
  the field `isAssignable` filters on. Empty rather than a stand-in value, and
  `tool-row.tsx` renders no badge for an empty one — a blank status is a
  backfill gap worth seeing.
- `tools-dashboard.tsx` and `pickup-tool-picker.tsx` were **left on the old
  `status`** deliberately: they are its live writers alongside `/wf/Set Status`,
  and nothing writes `statusNew` from Next.js yet, so pointing them at it would
  show a value that goes stale on every pickup.
