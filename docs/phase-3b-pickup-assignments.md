# Phase 3B — pickup requests record their physical tools

Read [`phase-3-pickup-lifecycle.md`](./phase-3-pickup-lifecycle.md) first.
[`phase-3a-condition-split.md`](./phase-3a-condition-split.md) should be
complete — this slice's creation path writes `condition`, and 3A is what makes
that field exist.

## Scope

**In:** persisting the pickup request's physical tool ids as `assignedtools`
rows, flagging those tools `Pickup Requested`, landing the request at
`Assigned`, showing requested-vs-recorded on the detail page, and fixing the
delivery-worded next-action that pickup requests currently get.

**Out:** the pickup screen and any movement write — 3C. This slice adds no
route and moves no tool's location.

## The gap

`components/pickup-tool-picker.tsx` selects physical `tools` rows, keyed by id
in a `Map<string, PickupSelection>`. But only two things are persisted:

- `toolLinesOfPickup(selected)` → `{ name, quantity: 1 }[]` →
  `formatToolsSummary` → `requestedtools.toolsSummary`, i.e. **names only**;
- `changedConditionLines(selected)` → the `"<id>::<condition>"` list, consumed
  once by the `update-tool-status` fan-out and then gone.

So after a pickup request is created, **nothing in the database says which
physical tools it named.** A driver's screen would have to re-resolve names
against `listToolsForJob(job)`, which is exactly the fragile inference
`phase-2-lifecycle.md` rejected when it chose a child table over a list field:
renamed rows, blank or dangling `tools.type`, and names `parseToolsSummary`
can't round-trip.

Delivery solved this with `assignedtools`. Pickup reuses it unchanged.

## Checklist

- [ ] **1. Bubble Studio** — `new-pickup-request` gains `assignments`, the
      fan-out step, `status = "Assigned"`, and the `Pickup Requested` list-change
- [ ] **2. The picker** — `PickupSelection.typeName` + `assignmentsOfPickup`
- [ ] **3. Schema + payload** — `assignments` through to the workflow call
- [ ] **4. Detail page** — requested vs recorded for pickup requests
- [ ] **5. Next-action fix** — branch on `request.pickup`, disabled until 3C

---

## 1. Bubble Studio — `new-pickup-request`

Four additions to the existing workflow. **No new workflow.**

### a. New parameter `assignments`

A **list of objects** `{ toolId, extra, toolType }`, defined with Detect Data —
the identical shape `create-assigned-tool` already accepts, so paste one of its
sample payloads to define it.

### b. Fan out `assign-request-tool`

A **Schedule API Workflow on a list** step:

- **Type of things:** the `assignments` object type
- **List to run on:** `assignments`
- **Workflow to run:** `assign-request-tool` (the existing **private** helper)
- **Only when:** `assignments is not empty`

Pass the newly created request's id (from the *Create a new request* step) as
the helper's `requestId`, and each item's fields for the rest.

> **Fan out the private helper, not the public `create-assigned-tool`.** The
> public one begins by *deleting* the request's existing `assignedtools` rows —
> pointless on a request created three steps earlier, and calling a public
> endpoint from inside another workflow is a pattern this codebase avoids. The
> helper does one *Create a new assignedtools* and nothing else, which is
> exactly what is wanted here.

### c. `status = "Assigned"` on the create step

Set it directly on the existing *Create a new `request`* action. Pickup tools
are named at creation, so the request is born ready to collect — there is no
separate assign step to reach `Assigned` later.

Plain text, not an option set: `"Assigned"`.

### d. Flag the tools `Pickup Requested`

A **Make changes to a list of things**:

- **List:** `Search for tools (unique id is in <the tool ids>)`
- **Field:** `statusNew` = `Pickup Requested` (`:converted to ToolStatusNew`)
- **Only when:** the list is not empty

Source the ids from `assignments:each item's toolId` if Studio allows it on
your parameter shape; otherwise add a plain `toolIds` text-list parameter and
send it alongside. Either is fine — the second is easier to reason about in
Studio and costs one more payload key.

> **Nothing sets `Pickup Requested` today.** It exists in `ToolStatusNew` and
> in the dashboard's badge map, but the only way a tool acquires it is a PM
> picking it by hand in the picker — which, after 3A, is no longer even an
> option there. This step is what makes the value mean something.

### Zero-Bubble-change fallback

If you would rather not touch `new-pickup-request`: have
`createPickupRequestAction` call the existing `assignTools(requestId, entries)`
(`lib/bubble/assigned-tools.ts:348`) after `createPickupToolRequest` returns
`{ requestId }`. It posts to `create-assigned-tool`, which is idempotent and
count-checked, and sets `status = "Assigned"` itself. You would still need a
second call for the `Pickup Requested` flag.

The cost is reintroducing a multi-call partial failure in Next.js, which
`CLAUDE.md` deliberately moved into Bubble — *"Partial failure (a `request` row
without its `requestedtools` row) now lives inside Bubble, not here."* That is
why this is the fallback, not the recommendation.

---

## 2. `assignedtools.toolType` for pickup rows

Set it to the **physical tool's name**.

For delivery, `toolType` is the `toolstype` name from `toolsSummary` that a
tool fills. For pickup, `toolsSummary` entries **are** physical tool names —
`toolLinesOfPickup` maps `tool.name` with quantity 1 — so the physical name
*is* "the `toolsSummary` name this row fills". The field's documented meaning
is preserved, not stretched.

`lib/schemas/assignment.ts:21-26` already records that the field is cosmetic:

> The slot's stored `toolType` string, or a tool's own type name for an extra.
> Cosmetic — `buildSlots` groups on it, nothing resolves it back to a
> `toolstype` row — so an empty string is allowed rather than rejected.

The payoff: `buildSlots(requestedLines, assigned, toolTypes)` lines up for
pickup with **no new logic**, so "3 of 5 picked up" falls out of the existing
requested-vs-assigned comparison the assign screen already renders. Comment it
at the write site so nobody "fixes" it to a type name later.

---

## 3. Next.js

| File | Change |
| --- | --- |
| `lib/schemas/pickup-request.ts` | Add `assignments: z.array(assignmentEntrySchema)`, **importing `assignmentEntrySchema` from `lib/schemas/assignment.ts`** rather than redefining the shape |
| `components/pickup-tool-picker.tsx` | `PickupSelection` gains `typeName: string \| null`; `selectionOfTools` seeds it from `tool.typeName`; new export `assignmentsOfPickup(selected): AssignmentEntry[]` mapping `{ toolId: id, extra: false, toolType: name }` — the physical name, per §2. `extra` is always `false`: on a pickup every tool *is* the request |
| `components/pickup-request-form.tsx` | `updateSelected` also sets `assignments` via `setValue` |
| `lib/bubble/requests.ts` | `createPickupToolRequest` sends `assignments` (and `toolIds`, if you took that route in §1d) in the `new-pickup-request` payload |

`assignmentsOfPickup` sits beside the existing `toolLinesOfPickup` and
`changedConditionLines` — three pure derivations off the same `Map`, which is
why the picker keeps its id-keyed selection state rather than a `Set` of names.

---

## 4. The detail page

`app/(app)/requests/[requestId]/page.tsx` already reads
`listAssignedTools([requestId])` and renders requested-vs-assigned for
delivery. For a pickup request the same call and the same `buildSlots` give
requested-vs-**recorded** — reuse them, and only change the wording:
"Requested" / "Recorded" rather than "Requested" / "Assigned".

Nothing new to fetch. Nothing new to compute.

## 5. The next-action fix — a live bug

`NEXT_ACTIONS` (`app/(app)/requests/page.tsx`) and `NextAction`
(`app/(app)/requests/[requestId]/page.tsx`) key off `request.status` **alone**.
Nothing in either consults `request.pickup`. So a pickup-only request today
offers **"Assign tools"** and delivery wording, pointing at
`/requests/[id]/assign` — a screen built entirely around requested tool
*types* and their quantities, which a pickup request does not have.

This lands here rather than in 3C because 3B is what first puts pickup requests
at `Assigned`, making the wrong button reachable on every new one.

Branch both maps on `request.pickup`. Point pickup's `Assigned` action at 3C's
route (`/requests/[id]/pickup`) and render it **disabled, with an alert saying
why**, until 3C lands — the pattern `phase-2a-assignment.md` step 6 used for
Save, and for the same reason: a disabled control that explains itself beats a
hidden one or a link to a 404.

---

## Verification

Create **one** pickup request for a job whose tools you note down first, then
confirm in Bubble's Data tab:

- one `assignedtools` row per checked tool, with the right `toolID`, the
  physical tool's **name** in `toolType`, and `extra = no`;
- `request.status = "Assigned"`;
- every checked tool's `statusNew = "Pickup Requested"`;
- `condition` written **only** on tools whose condition the PM actually changed
  — the changed-only diff from 3A still holding.

Then:

- the detail page shows requested vs recorded correctly, and the request's
  next action reads as a pickup action (disabled), not "Assign tools";
- **submit the same request's form twice** if you want to prove the fan-out is
  safe — note that unlike `create-assigned-tool` this path does **not**
  delete-first, so a second submit creates a second request with its own rows,
  which is correct;
- an existing **delivery** request's detail page, assign screen and next action
  are unchanged.

## Known limits

- **No delete-first on this path.** `assign-request-tool` fanned out from
  creation is additive, which is fine because the request is new. 3C's subset
  replace is what needs idempotency, and it uses the public
  `create-assigned-tool` for exactly that.
- **`extra` is always `false` on pickup rows.** The flag distinguishes "an
  addition, not a slot fill" on delivery; on pickup every recorded tool is a
  requested tool, so nothing sets it. Left in place rather than special-cased
  so the two row shapes stay identical.
- **Requested-but-not-recorded is invisible** until 3C creates the case. If the
  fan-out partially fails, `toolsSummary` will name more tools than
  `assignedtools` holds, and the detail page will show it as an unfilled slot —
  which is the honest rendering, and readable without extra code.
