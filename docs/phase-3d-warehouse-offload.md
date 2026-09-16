> **Superseded by [`phase-4-trips.md`](./phase-4-trips.md) (2026-09-15). Not
> built as its own slice.**
>
> "Drop a collected load at a warehouse" is a **drop at a `Warehouse`-kind
> stop**: the tool becomes `Available` at the warehouse's name, `currentUser`
> stays the driver, and `condition` is untouched — precisely what §2 below
> specifies, reached through `complete-trip-stop` rather than a `returnRequest`
> of its own.
>
> **§1 was carried out and its answer is recorded.** The live read it asked for
> happened on 2026-09-15: `"Warehouse"` is the only warehouse string in
> `tools.location` (229 of 532 tools, no variants). `WAREHOUSE_JOB_NAMES` and
> `DEFAULT_WAREHOUSE` exist in `lib/bubble/enums.ts` as specified, and the
> question this doc asked — whether they should differ from
> `WAREHOUSE_LOCATIONS` — was answered **yes**.
>
> Its "No partial return" limit is **lifted**: each `triptool` row carries its
> own `toLocation`, so one trip can return different tools to different
> warehouses.

# Phase 3D — warehouse offload

Read [`phase-3-pickup-lifecycle.md`](./phase-3-pickup-lifecycle.md) first.
[`phase-3c-actual-pickup.md`](./phase-3c-actual-pickup.md) must be complete —
this slice acts on requests it left at `In Transit`.

## Scope

**In:** naming the warehouses, and the action that drops a collected load at
one: tools back to `Available` at the warehouse's `location`, request to
`Returned`.

**Out:** letting the receiver re-inspect and correct each tool's `condition` —
see "Deliberately out of scope" below.

This is the last slice. It closes the loop: tools returned here are findable by
`listToolsForJob(<warehouse>)`, which is what makes them offerable to the next
delivery's assign screen.

## Checklist

- [ ] **1. Read the live location strings** — before writing any constant
- [ ] **2. `WAREHOUSE_JOB_NAMES`** in `enums.ts` + `warehouseOptions` helper —
      **2D already added `WAREHOUSE_LOCATIONS` there** (`["Warehouse",
      "1407 Locker", "Other - Not a Job Site"]`, with `isWarehouseLocation`).
      Extend or rename that one rather than defining a second list that can
      drift; see [`phase-2d-site-to-site-transfers.md`](./phase-2d-site-to-site-transfers.md)
- [ ] **3. `returnRequest`** in `requests.ts`
- [ ] **4. `returnSchema` + `returnAction`**
- [ ] **5. `complete-pickup-action.tsx`** on the detail page
- [ ] **6. Active trips** — the per-stop link reaches it

---

## 1. Warehouses are already pseudo-`jobs` rows

No new table, no option set, no migration. **`"Warehouse"`,
`"1407 Locker"` and `"Other - Not a Job Site"` already exist as rows in the
`jobs` table**, and the `new-request` workflow already excludes those three
names by hand in its ClickUp step
(`bubble-new-request-workflow-summary.md:127`):

```
(Result of step 3's name is not "Warehouse") AND (… is not "Other - Not a Job Site")
AND (… is not "1407 Locker") AND (delivery is yes OR pickup is yes)
```

So the pattern is established in live data and in a live workflow. `location`
is free text matched with `equals` against a job's `name`, so a pseudo-job
produces a perfectly good location string, and `listToolsForJob("Warehouse")`
already works today with no special-casing.

> **Why not a `warehouses` table.** It would put warehouse names in two
> places: the new table *and* the pseudo-job rows, which cannot be deleted
> without breaking the ClickUp exclusion and every historical
> `tools.location` string. A dual source for the one string that has to match
> exactly is the opposite of what this needs.
>
> **Why not an option set.** `CLAUDE.md` records that Swagger does not expose
> option-set values, so they would have to be hardcoded in `enums.ts` *anyway*
> — the same code deploy as the constant — while adding the "an unrecognised
> option-set write fails silently" hazard. It buys nothing.

### Step one is a read, not a write

**Before hardcoding anything**, read the live distinct `tools.location` values
and record the exact strings — trailing spaces, capitalisation, the lot. Add it
to `scripts/check-bubble.ts` (`npm run check-bubble`, GET-only, the sanctioned
tool for this) and note what comes back.

A near-miss is a silent, ugly failure: tools returned to `"warehouse"` or
`"Warehouse "` form a *second* group card on the Tools dashboard next to the
real one, and `listToolsForJob` finds neither from the other. There is no
referential integrity to catch it.

While in there, confirm whether `"1407 Locker"` is genuinely a warehouse or
something else — the ClickUp exclusion groups it with `"Other - Not a Job
Site"`, which is plainly *not* a warehouse, so the list of three is an
exclusion list, not a warehouse list. Only include what is actually a place
tools come back to.

### The code

| File | Change |
| --- | --- |
| `lib/bubble/enums.ts` | `WAREHOUSE_JOB_NAMES` (`as const`) + `DEFAULT_WAREHOUSE`. Document the provenance in the doc comment — *read off live rows*, the same provenance `WE_ARE` and `TO_DO` already carry |
| `lib/bubble/reference-types.ts` | Pure `warehouseOptions(jobs: Job[]): Job[]`, filtering the memoised `listJobs()` by the constant. Goes in `-types.ts`, not `reference.ts`, because `reference.ts` is `server-only` and the picker is a client island |

```ts
/**
 * Warehouses are ordinary `jobs` rows — see docs/phase-3d-warehouse-offload.md.
 * Read off live rows; the strings must match `jobs.name` byte for byte, since
 * `tools.location` is matched against them with `equals` and nothing enforces
 * referential integrity.
 */
export const WAREHOUSE_JOB_NAMES = ["Warehouse"] as const
export const DEFAULT_WAREHOUSE = "Warehouse"
```

**Since this was written, 2D shipped `WAREHOUSE_LOCATIONS` in the same file**
for the inverse question ("is this tool *not* on a job site?"). The two lists
answer different questions — a returnable *destination* is a narrower set than
a location that merely doesn't need a pickup stop — so keeping them separate
may be right. Decide deliberately after step 1 rather than by accident, and if
they turn out identical, keep one.

Start with whatever step 1 actually confirms. One entry is fine — a `Select`
with a single option is still the right control, because the *next* warehouse
is a one-line change with no schema work.

---

## 2. The write

`lib/bubble/requests.ts`:

```ts
export async function returnRequest(
  requestId: string,
  toolIds: string[],
  warehouseName: string
): Promise<{ toolsUpdated: number }>
```

One `update-request-status` call:

| Param | Value |
| --- | --- |
| `requestIds` | `[requestId]` |
| `status` | `"Returned"` |
| `toolIds` | the request's `assignedtools` tool ids, read fresh |
| `toolStatus` | `TOOL_STATUS_AVAILABLE` |
| `toolLocation` | the warehouse name, **exactly** |
| `driver` / `toolUser` | **not sent** |

Modelled directly on `offloadRequest` (`requests.ts:656`) — same shape, same
count-check, same reasoning for the two omissions: `currentUser` stays as the
driver, a real record of who moved the tool, and `driver` on the request is
already set from 3C.

> **`TOOL_STATUS_AVAILABLE` is already declared in `enums.ts` and unused**,
> kept on purpose for the transition that would need it. This is its first
> consumer.

`condition` is not in that table and that is the point — the workflow writes
only `statusNew`, `location` and `currentUser`, so the PM's condition pick from
3A arrives at the warehouse intact. **That is the payoff for the whole phase
ordering.**

### Schema and action

`lib/schemas/assignment.ts`:

```ts
export const returnSchema = z.object({
  requestId: z.string().min(1),
  warehouse: z.enum(WAREHOUSE_JOB_NAMES),
})
```

`z.enum`, not `z.string()` — a warehouse name that isn't in the constant is
exactly the typo that would silently strand a load, and this is the boundary
where it can still fail loudly.

`app/(app)/requests/[requestId]/actions.ts` gains `returnAction`, beside the
existing `offloadAction` and following it step for step:

1. `await requireSession()`.
2. `getRequest`; reject unless `status === "In Transit"` **and**
   `request.pickup` — *"This request is already {status}. Reload the page."*
3. `listAssignedTools([requestId])` for the tool ids — derived server-side, not
   taken from the client.
4. `returnRequest(requestId, toolIds, values.warehouse)`.
5. `revalidatePath` on `/requests`, `/requests/{id}`, `/dispatch/active`,
   `/tools`.

Reuse `OffloadState` (`[requestId]/action-state.ts`) if its shape fits —
`{ idle | error | delivered }` needs a `returned` member or a rename; prefer
adding a small `ReturnState` over bending the delivery one, since both actions
live on the same page.

---

## 3. The UI

Lives on the request detail page, mirroring `CompleteDeliveryAction`. The
dedicated `/offload` route was already folded away for exactly this reason —
*"that page only ever repeated the detail page's own layout around one action
card"* (`phase-2bc-dispatch-offload.md`).

**`components/complete-pickup-action.tsx`** — a `Dialog` + confirm, ~96 lines
like its delivery sibling, with one addition: a **warehouse `Select`** fed by
`warehouseOptions(jobs)` and defaulting to `DEFAULT_WAREHOUSE`. List the tools
about to be returned so the receiver can see what they are accepting, with each
one's condition badge — a tool arriving flagged `Repair Required` should be
visibly flagged at the moment it is booked in.

Submit via `handleSubmit` + `useTransition` calling the action directly, then
`router.refresh()`. No `<form action>` / `useActionState` — matching every
other form in this app.

The detail page renders it when `request.pickup && status === "In Transit"`,
the same way it renders `CompleteDeliveryAction` for the delivery case.

---

## Verification

Return the request from 3C, then confirm in Bubble:

- every returned tool: `statusNew = "Available"`, `location` = the warehouse
  string **exactly**, `currentUser` still the driver;
- **`condition` unchanged on every one of them** — including the tool the PM
  flagged at request time. This is the check the whole phase exists for;
- `request.status = "Returned"`, and the detail page renders it as a terminal
  pill with no further action;
- one `toolshistory` row per tool, not two.

Then the round trip that proves the location lifecycle closed:

- `/tools` groups the returned tools under the warehouse — the dashboard groups
  by whatever string `location` holds with no special-casing beyond
  `NO_LOCATION`, so this needs no dashboard change;
- open a **delivery** request's assign screen and confirm those same tools are
  now offered as candidates. That is the proof they re-entered circulation;
- the left-behind tools from 3C are still `Pickup Requested` at the job and
  still absent from the warehouse group.

Guards: the action refuses a request already `Returned`, and refuses a delivery
request at `In Transit` (that one gets Complete delivery instead).

Writes hit the **live** database.

## Deliberately out of scope

**Letting the receiver adjust each tool's `condition` in the return dialog.**
This is the natural home for an inspection step — it is the one moment someone
physically handles every tool — and the existing `update-tool-status` fan-out
could carry it unchanged. But it needs either a public wrapper around that
private helper or a new per-tool param on `update-request-status`, and
`bubble-update-request-status-spec.md` is explicit about why that workflow uses
a synchronous list-change rather than a fan-out. Worth its own slice; not worth
bending this one.

## Known limits

- **Warehouse list is a code constant.** Adding one is a one-line change plus a
  deploy. Accepted at 1-3 warehouses that essentially never change; if that
  stops being true, `jobs.isWarehouse` (one yes/no field, admin-manageable, no
  migration) is the next step up and needs no other rework.
- **Nothing validates that the warehouse row still exists in `jobs`.** The
  constant and the table can drift. `check-bubble` is the place to assert it.
- **Condition is captured at request time, not inspection time** — see above.
- **No partial return.** The whole load lands at one warehouse. Splitting a
  load across two destinations would need per-tool locations, which the
  workflow's single list-change cannot express.
