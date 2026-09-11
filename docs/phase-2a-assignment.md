# Phase 2A — tool assignment

> **The Bubble side is built, and it diverges from this document.**
> [`phase-2a-assignment-handoff.md`](./phase-2a-assignment-handoff.md) is the
> as-built reference and **wins wherever the two conflict** — the public
> workflow is `create-assigned-tool` (not `assign-request-tools`),
> `assignments` is a real JSON array (no `::` encoding), `update-request-status`
> was not built, and `tools.statusNew` has been backfilled. The Next.js code
> matches the handoff, not the plan below.

Read [`phase-2-lifecycle.md`](./phase-2-lifecycle.md) first — it holds the
schema, the workflow specs and the availability rule that this slice
implements. This doc is the scope, the file list, the order and the running
checklist.

## Scope

**In:** assigning real `tools` rows to a delivery request against its requested
types, leaving slots empty, adding extra tools, and unassigning. Plus the
`tools.status` option-set migration and both Bubble workflows.

> **Superseded:** assign writing `Assigned` and unassign writing `Available`
> was the original plan here. Decided against — see the Assign/Unassign note
> in `phase-2-lifecycle.md` and `phase-2a-assignment-handoff.md`'s final
> section. Assign/unassign never touch `tools.statusNew`.

**Out:** dispatch, drivers, offload, `tools.location`, pickup requests. See
[`phase-2bc-dispatch-offload.md`](./phase-2bc-dispatch-offload.md).

`request.driver` is created in Bubble now but stays unused until 2B — one
Studio trip instead of two.

## Checklist

Update this as steps land, so a fresh chat can resume mid-slice.

> **The order was changed on purpose: UI first, schema after.** Steps 5 and 6
> were built against the live schema exactly as it is today — no Bubble field
> was added, renamed or written. Everything that reads a not-yet-existing type
> or field degrades to empty rather than throwing: `request.status` is absent
> on every row and reads as `New`, and `listAssignedTools` turns the
> `assignedtools` 404 into an empty list (`listMaybeMissing` in
> `lib/bubble/assigned-tools.ts`). So the assign screen currently renders every
> slot empty, which is the truth. Steps 1–3 are what make it stop being empty;
> nothing in 5/6 needs revisiting when they land.

- [x] **0. Docs** — this file, `phase-2-lifecycle.md`,
      `phase-2bc-dispatch-offload.md`, `bubble-request-status-workflow.md`,
      `CLAUDE.md` pointer
- [–] **1. Read-only spike** — `scripts/check-bubble.ts`. **Skipped**, on the
      user's call. The two questions it would have answered for correctness are
      already defended against in code: `listCandidateTools` re-filters the
      `in`-on-a-link result in JS and falls back to a full read, and
      `getRequest`/`listTakenToolIds` tolerate a missing `status`. The one it
      answered for *safety* — how many rows hold each `tools.status` — is now a
      manual check in the Bubble Data tab before the rename (step 3)
- [x] **2. Read the Bubble side** — `toolshistory`'s schema is now confirmed
      live (see `docs/phase-2-lifecycle.md` and
      `docs/bubble-update-request-status-spec.md`): `tool`, `prevLocation`/
      `newLocation`, `prevLocationFloor`/`newLocationFloor`,
      `prevStatus`/`newStatus` (option set, the old `Tool Status` set), `notes`,
      `picture`. It already holds ~1,542 rows from `/wf/Set Status`/
      `/wf/Set Location`. Rather than calling those legacy workflows, phase 2
      writes its own `toolshistory` rows (from `update-request-status`) using
      two new fields, `prevStatusNew`/`newStatusNew`, so it doesn't collide
      with the old ones' option set. `/wf/Set Status`/`/wf/Set Location`
      themselves were not otherwise inspected — nothing here depends on their
      internals beyond the `toolshistory` schema they write to.
- [x] **3. Bubble Studio** — done, with deviations. `ToolStatusNew` +
      `tools.statusNew` (a new option set and column rather than a rename), and
      `statusNew` since **backfilled** from `status` on every row.
      `assignedtools`, `request.status` + `driver`, and **two** workflows:
      public `create-assigned-tool` and its private helper
      `assign-request-tool`. `update-request-status` was **not** built and is
      deferred. Postman-tested, including the re-save-doesn't-duplicate case.
      See [`phase-2a-assignment-handoff.md`](./phase-2a-assignment-handoff.md)
- [x] **4. `enums.ts`** — done, and **the two status maps are no longer part of
      it**. There is no rename: the user built a separate `ToolStatusNew` option
      set and a `tools.statusNew` column instead, so `TOOL_STATUS` and
      `tools.status` stay exactly as they are and keep their existing writers
      (the Pickup picker here, `/wf/Set Status` in the old UI). `enums.ts` now
      carries `TOOL_STATUS` (old, unchanged) alongside `TOOL_STATUS_NEW` +
      `ToolStatusNew`, the four named lifecycle values typed against it,
      `REQUEST_STATUS`, and `UNASSIGNABLE_TOOL_STATUS` trimmed to the five
      condition values — `isAssignable` reads **`statusNew` only**.
      `tools-dashboard.tsx` and `pickup-tool-picker.tsx` are untouched and stay
      on the old field until a later pass moves them
- [~] **5. `requests.ts` extensions, `assigned-tools.ts` + types, detail page**
      — `status`/`driver` on `requestRow`/`ToolRequest`/`toToolRequest`,
      `getRequest`, `lib/bubble/assigned-tools.ts` (reads only) +
      `assigned-tools-types.ts` with `buildSlots`, the detail page and
      `request-status-badge.tsx`; `/requests` cards link to it and carry the
      badge. `listRequestsByStatus` is **not** written — it has no consumer
      until 2B's dispatch board, so it lands with that
- [x] **6. Assign screen, read-only** — `assign/page.tsx` + `loading.tsx`,
      `assign-tools-panel.tsx`, `assign-slot.tsx`, `extra-tools-picker.tsx`,
      the shared `tool-row.tsx`, and `searchToolsAction`. Save is rendered
      disabled with an alert saying why, rather than hidden
- [x] **7. Writes** — realigned to the as-built backend. In:
      `lib/schemas/assignment.ts`, `assignTools` in `assigned-tools.ts` (posting
      to `create-assigned-tool`, `assignments` as plain objects),
      `assignToolsAction` in the assign route, and Save wired in
      `assign-tools-panel.tsx`. `requireSession()` restored in
      `requests/actions.ts` and added to both pickup actions.
      **`lib/bubble/assignment-entries.ts` was deleted** — the workflow takes
      objects, so there is nothing to encode; `AssignmentEntry` lives in
      `assigned-tools-types.ts`. **`updateRequestStatus` was removed** along
      with the action's `dropped` diff: its workflow doesn't exist yet, so an
      assignment changes `assignedtools` rows and `request.status` (set by the
      workflow itself) and **no tool's `statusNew`**.
      **Unassign got no action of its own** — `create-assigned-tool` replaces
      the whole set, so removing a tool and saving *is* the unassign. A
      `bubbleDelete` single-row path would be a second writer to the same state
      with no caller

---

## 1. Read-only spike

Extend `scripts/check-bubble.ts` (`npm run check-bubble`, GET-only, the
sanctioned tool for this). It currently covers neither `tools` read path — add
them. Report, against live data:

| Question | Why it matters |
| --- | --- |
| The **distribution of `tools.status`** — which values exist, how many rows each | So the option-set change is a rename, not data loss |
| `toolstype` name collisions after `trim().toLowerCase()` | Names are how a slot finds its candidate tools |
| How many `tools` rows have a blank or dangling `type` | Those are invisible to the type-filtered candidate query |
| **How many distinct `toolsSummary` names fail to resolve to a `toolstype` name** | Decides how good the slot → candidate offering can be. High and the extras search carries more of the load |
| Does `{key: "type", constraint_type: "in", value: [...]}` work on a **link** field? | Only `in` on plain text is proven today (`withLines`) |
| Does `greater than` work on the **custom** `requestDateEnd`? | Only the system `Created Date` is proven (`listRequestsSince`) |
| Does `request` already have a `status` field? | `CLAUDE.md` counts 24 business fields and the known list accounts for all 24 — check before adding |

## 2. Read the Bubble side you'll collide with

The old Bubble UI is live and is a **second writer** of `tools.status`, and of
`toolshistory` (via its pre-existing `/wf/Set Status`/`/wf/Set Location`
workflows — confirmed live, ~1,542 rows). Rather than calling those legacy
workflows, phase 2's `update-request-status` writes its own `toolshistory`
rows directly, using new fields (`prevStatusNew`/`newStatusNew`) so it doesn't
collide with the old ones' option set. See `docs/bubble-update-request-status-spec.md`.

## 3. Bubble Studio

Per [`bubble-request-status-workflow.md`](./bubble-request-status-workflow.md).

## 4. `enums.ts` and the two status maps

Self-contained and verifiable on the **existing** screens before any new UI
exists — do it as its own step and check it before moving on.

| File | Change |
| --- | --- |
| `lib/bubble/enums.ts` | `TOOL_STATUS` → the 10 new values. Add `REQUEST_STATUS` (`as const`) + `RequestStatus`, `UNASSIGNABLE_TOOL_STATUS` (the five condition values), and named constants for `Available` / `Assigned` so no transition writes a bare literal |
| `components/tools-dashboard.tsx` | `STATUS_BADGE_CLASSES` 7 keys → 10. Reuse `--status-active` for In Transit / Assigned, `--status-ok` for Available / Delivered |
| `components/pickup-tool-picker.tsx` | The status `Select`. It already tolerates an off-list live value by prepending it as an extra option — **keep that**, it is what makes the migration order-independent |

## 5. Data layer + detail page

**`lib/bubble/requests.ts`** — extend, don't fork:

- `status` / `driver` on `requestRow`, `ToolRequest` and `toToolRequest`
  (`status` defaulting to `"New"`).
- `getRequest(id)` — `bubbleGet` then reuse the existing **`withLines`** helper
  with a one-row array. `withLines` already merges the N `requestedtools` rows a
  request can carry and sums quantities; the assign screen must go through it
  rather than reading one row.
- `listRequestsByStatus(status, driver?)` — 2B's dispatch board is its first
  consumer, but it shares the parse, so it lands here.

**`lib/bubble/assigned-tools.ts`** (new, `server-only`). Workflow names pinned
to module constants, as `NEW_REQUEST_WORKFLOW` is:

```ts
listAssignedTools(requestIds: string[]): Promise<AssignedTool[]>   // one `in` query
listCandidateTools(typeIds: string[]): Promise<CandidateTool[]>
listToolsByIds(ids: string[]): Promise<CandidateTool[]>            // no condition filter
searchTools(query: string): Promise<CandidateTool[]>               // the lazy extras pool
listTakenToolIds(request: ToolRequest): Promise<Map<string, Conflict>>
assignTools(requestId, entries): Promise<void>                     // create-assigned-tool
```

`unassignTool` was never written — a wholesale replace *is* the unassign.
`updateRequestStatus` is **deferred**: its Bubble workflow doesn't exist. See
the handoff for its intended signature when it lands.

**`lib/bubble/assigned-tools-types.ts`** (new, client-safe — the same split as
`pickup-tools-types.ts`, because the picker is a client island):
`AssignedTool`, `CandidateTool`, `AssignSlot`, and the **pure**
`buildSlots(requestedLines, assignedRows, toolTypes)`.

`buildSlots` groups on the **stored** `toolType` — no name→id inference for
correctness. Name→id is still used to *offer* candidates for a slot; when a
name doesn't resolve, that slot falls back to the search dialog instead of
being unfillable. A requested line whose `toolstype.consumable` is true renders
as "Consumable — nothing to assign", not as an empty slot.

**`app/(app)/requests/[requestId]/page.tsx`** — detail: facts, requested vs
assigned tools, a status stepper, the action for the current status. Light — no
tools fetch. Cards on `app/(app)/requests/page.tsx` become links to it and gain
a status badge.

**`components/request-status-badge.tsx`** — shared with the `/requests` cards.
Copy the `MOVEMENT_THEMES` + `themeFor()` pattern from
`app/(app)/requests/page.tsx`.

## 6. The assign screen, read-only

Full slot derivation, candidates, conflicts — **Save disabled**. This exercises
every hard read path against live data at zero risk, and it is the part most
likely to be wrong.

`app/(app)/requests/[requestId]/assign/page.tsx` + `loading.tsx`. **One** route,
branching on `status` — 2B's dispatch action lands on this same page rather
than a third route, because it reads the same expensive dataset.

Fetch: `getRequest` (2 calls), then three in parallel:

```ts
const [candidates, conflicts, toolTypes] = await Promise.all([
  listCandidateTools(typeIds), // tools where `type in [...]` — not the whole table
  listTakenToolIds(request), // the 2 availability queries
  listToolTypes(), // 5-min memoised, free
])
```

- The **extras** pool is lazy: a `searchToolsAction(query)` server action
  running `name text contains`, called only when the "Add extra tool" dialog
  opens. It is **not** constrained by `type`, so tools with a blank or dangling
  `type` — excluded from the candidate query — stay reachable.
- `bubbleListAll` paginates **sequentially** and retries on 429, so this screen
  is heavier than the `Promise.all` suggests. Stream it under `<Suspense>` with
  a `loading.tsx`, the way `/requests` and `/tools` already do.

Components (base-ui shadcn — `render` not `asChild`, `items` on `Select`,
`toast.add`; see `.agents/skills/shadcn/`):

| File | Role |
| --- | --- |
| `components/assign-tools-panel.tsx` | The client island. Mirror `pickup-tool-picker.tsx`: `Map` keyed by tool id, `ItemGroup`/`Item`/`Checkbox`, `InputGroup` search, `Empty` for every zero state. **Nothing written until Save**, matching the create form's rule |
| `components/assign-slot.tsx` | One requested type: name, "2 of 3" badge, chosen tools, Add, Remove per tool. Unfilled slot = `Empty` with `border-dashed`, the existing idiom |
| `components/extra-tools-picker.tsx` | The `ToolPickerDialog` pattern, behind the lazy search action |

## 7. Writes

`lib/schemas/assignment.ts` — `assignToolsSchema` (`requestId`, `assignments`)
and `unassignSchema` only; 2B/2C add theirs. Validated in the client form
**and** re-validated in the action, as the existing pair does. Reuse
`CreateRequestState` / `INITIAL_CREATE_STATE` from
`app/(app)/requests/action-state.ts` rather than inventing a second result
union.

`app/(app)/requests/[requestId]/assign/actions.ts` — each action starts with
`await requireSession()` and ends in `revalidatePath`.

**Fix in the same pass:** `requireSession()` is commented out at
`app/(app)/requests/actions.ts:18` and absent from both pickup actions. One
line each.

---

## Verification

- `npm run typecheck` and `npm run build` from `next-ambient/`.
- `npm run check-bubble` green, with the new read paths in it.
- **After step 4, before anything else:** the Tools dashboard and the Pickup
  picker still render every live tool with a correct badge and nothing falls
  through to default styling. That is what proves the option-set migration
  landed.
- **After step 6:** open the assign screen for several existing requests and
  check the derived slots against what each actually asked for. No writes.
- **Manual write test, on one deliberately chosen request:** assign (leave one
  slot empty, add one extra), then unassign one. Confirm in Bubble that
  `request.status`, the `assignedtools` rows and each `tools.status` match the
  lifecycle table, and that the workflow's returned count matches what was
  sent. **Re-save the same assignment and confirm the row count doesn't
  double** — that is what proves the delete-first idempotency step works.
- Regressions: the requests list still renders rows with no `status`; the
  Pickup flow still loads a job's tools and writes statuses; the dashboard's
  `localStorage` location filter (`tools-dashboard:locations`) still restores.

Writes hit the **live** database. Every manual step above puts real data in it.
