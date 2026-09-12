# Phase 2B / 2C — dispatch and offload

**2B's board is built, frontend only.** Read
[`phase-2-lifecycle.md`](./phase-2-lifecycle.md) first, then
[`phase-2a-assignment.md`](./phase-2a-assignment.md) — 2A had to be complete
first, because both 2B and 2C consume `assignedtools` rows and both are meant
to reuse the `update-request-status` workflow it left deferred. That workflow
**still doesn't exist in Bubble** — see "As built" below.

Neither slice needs a new Bubble field, a new table or a new workflow. The
schema for all of phase 2 landed in 2A.

## Checklist

- [x] **Open question — driver source.** Settled with the user: **`pms` +
      `user`, merged, with a free-text fallback.** Neither is an actual driver
      roster (see below, kept for context) — this is a quick-pick convenience,
      not a source of truth, and `request.driver` stays free text either way.
      `listUsers()` (`lib/bubble/reference.ts`) was added to read the Bubble
      `user` type — 13 live rows, `displayName` only, confirmed via
      `npm run check-bubble`.
- [x] **Data layer** — `listRequestsByStatus(status, driver?)` added to
      `lib/bubble/requests.ts` (plain `status equals` / `driver equals`
      constraints, reusing `withLines`). Confirmed live: 2 rows at `Assigned`,
      0 at `In Transit` — the latter is expected, since nothing writes that
      status yet.
- [x] **The board, read-only** — `app/(app)/dispatch/page.tsx` +
      `components/dispatch-board.tsx` (one file, not split into a separate
      `dispatch-form.tsx` — the picker was simple enough not to need it, unlike
      the assign screen's dialogs). Checkbox multi-select over `Assigned`
      requests, a driver `Select` + free-text `Input` pair. Selected rows get a
      visible `border-primary` + ring so a multi-select doesn't hide what's
      picked. `NAV_ITEMS` in `components/app-sidebar.tsx` gained **Dispatch**.
- [x] **Active trips, its own screen** — moved off the board onto
      `app/(app)/dispatch/active/page.tsx` + `components/active-trips.tsx`,
      linked from the board (and from `NAV_ITEMS`, **Active trips**) rather
      than sharing the page. The tool-summary logic both screens need
      (`assignedtools` → physical `tools.name`, grouped and counted) now lives
      in `lib/dispatch/summary.ts` (`toDispatchSummaries`) so it isn't
      duplicated across the two pages.
- [x] **The write.** `lib/schemas/assignment.ts` has `dispatchSchema`
      (`requestIds` min 1, `driver`); `lib/bubble/requests.ts#dispatchRequests`
      calls `update-request-status` and count-checks the response, the same
      pattern `assignTools` uses; `app/(app)/dispatch/actions.ts#dispatchAction`
      re-checks every selected request is still `Assigned` right before
      writing, derives the tool-id union from fresh `assignedtools` rows, and
      redirects to `/dispatch/active` on success. **`update-request-status` is
      built and live** in Bubble (see "What it writes" below) — confirmed via
      real `request` rows carrying `status: "Delivered"` with a `driver` set.
- [x] **2C — Offload.** Built and live, on the request detail page rather than
      a dedicated route — see "Route" under 2C below. A `toolshistory` row per
      tool appears on both dispatch and offload too, but as a side effect of
      the pre-existing `DB - Tools Change Log` workflow reacting to
      `update-request-status`'s tools-update step, not from an explicit step
      in this app's workflow — see "What it writes" below and
      `docs/bubble-update-request-status-spec.md` for why.

**Now wired.** `app/(app)/requests/page.tsx`'s `NEXT_ACTIONS.Assigned` and the
request detail page's `NextAction` both link to `/dispatch?requestId={id}` —
`/dispatch` is still a shared board, not a per-request route, but the query
param preselects that one request there (`DispatchBoard` seeds its checkbox
state from it), so the card-level action reaches a working screen instead of
a disabled button. The detail page also gained a standalone `Dispatch` button
next to `Edit assignment` once a request is `Assigned` — previously that
screen only offered the assign flow. `Delivered` is unchanged: still terminal,
now rendered as a status pill instead of a disabled button on both screens,
and the requests list drops the second footer button entirely once a card
reaches `Delivered` since there is nothing left to do.

---

## Open question that shaped the driver picker (resolved above)

**Where do driver names come from?** `pms` is 12 **Project Managers**, not
drivers. `request.driver` is free text with the PM list offered as a
convenience, which means it can't be reliably matched against
`tools.currentUser` later. If a real driver roster exists somewhere in Bubble,
find it and use it instead.

No such roster turned up — the live Bubble types this repo reads are `request`,
`requestedtools`, `requestedmaterials`, `toolstype`, `jobs`, `pms`,
`timelabels`, `materials`, `tools`, `assignedtools` and `user`, and none of
them is a drivers table. The user's call was to offer `pms` **and** `user`
together as the quick-pick list, free text otherwise — see the checklist above.

---

## 2B — Dispatch

A driver/PM takes **one or more requests at once** from the warehouse.

### What it writes

| Thing | Field | Value |
| --- | --- | --- |
| `request` (N of them) | `status` | `In Transit` |
| | `driver` | the driver's name |
| `tools` (every assigned tool across those requests) | `status` | `In Transit` |
| | `currentUser` | the driver's name |
| | `location` | **the driver's name** |
| `toolshistory` (one new row per tool) | `prevLocation` → `newLocation` | the tool's prior `location` → the driver's name |

`location` means "current physical place, or whoever has custody" — a tool in
transit reads as being *with* the driver rather than still showing its
pre-dispatch place (`Warehouse`). See `phase-2-lifecycle.md` for the reasoning
and the trade-off this makes for a future return-to-warehouse flow.

One call to `update-request-status` with several `requestIds` and the union of
their `toolIds`. The workflow already accepts a list on both. That call's
edit to `tools.location`/`tools.statusNew` also triggers `DB - Tools Change
Log` (outside this project), which creates one `toolshistory` row per tool
for traceability — see `docs/bubble-update-request-status-spec.md`.

### Trips are derived, not stored

There is no `transport` table. A driver's live manifest is:

```ts
listRequestsByStatus("In Transit", driverName)
```

A request leaves that set the moment it is offloaded, so the query is
self-cleaning. If trip *history* ever matters, one `tripId` text field on
`request` stamped at dispatch is the cheapest addition — nothing else changes.

### Routes and components

| Path | Purpose |
| --- | --- |
| `app/(app)/dispatch/page.tsx` + `actions.ts` | The board. Requests at `Assigned` with checkbox multi-select and a driver picker, one Dispatch button. Below it, active trips grouped by `driver`, each request linking to its offload screen |
| `components/dispatch-form.tsx` | Driver `Select` fed by the memoised `listFieldPms()` with a free-text fallback. `FieldGroup`/`Field`, submit via `handleSubmit` + `useTransition` calling the action directly — matching both existing forms |

`NAV_ITEMS` in `components/app-sidebar.tsx` gains **Dispatch**. Its own comment
says entries appear "when they get routes, not before".

Fetching is one `listRequestsByStatus("Assigned")` plus one `in` query for
their `assignedtools` rows — cheap enough to render without a `Suspense`
boundary, unlike the assign screen.

`lib/schemas/assignment.ts` gains `dispatchSchema` (`requestIds` min 1,
`driver`).

---

## 2C — Offload

The driver arrives on site and drops the load.

### What it writes

| Thing | Field | Value |
| --- | --- | --- |
| `request` | `status` | `Delivered` |
| `tools` (this request's assigned tools) | `status` | `Delivered` |
| | `location` | **the job's `name`** |
| | `currentUser` | unchanged — kept as the driver, a real record of who moved it |
| `toolshistory` (one new row per tool) | `prevLocation` → `newLocation` | the driver's name → the job's `name` |

This is the **only** moment in phase 2 that writes `tools.location` to a job.
The value must be the job's `name` exactly, since `listToolsForJob` filters
`location equals jobName` and nothing enforces referential integrity.

One call to `update-request-status` with one `requestId`, the request's
`toolIds`, `toolStatus: "Delivered"` and `toolLocation: job.name` — whose
`tools` edit likewise triggers `DB - Tools Change Log`, producing one
`toolshistory` row per tool, the second entry in each tool's location trail
after dispatch's. See `docs/bubble-update-request-status-spec.md`.

### Route

No dedicated route — the action lives on the request detail page itself,
`app/(app)/requests/[requestId]/page.tsx`, as `CompleteDeliveryAction`
(`components/complete-delivery-action.tsx`): a button that opens a
confirmation dialog rather than navigating anywhere. It used to be its own
screen (`app/(app)/requests/[requestId]/offload/page.tsx`), but that page
only ever repeated the detail page's own layout around one action card, so
the duplicate route was folded into the one page instead.

The server action (`offloadAction`, `app/(app)/requests/[requestId]/actions.ts`)
is unchanged: `getRequest` plus one `in` query for `assignedtools` rows, then
`offloadRequest`.

`lib/schemas/assignment.ts` gains `offloadSchema` (`requestId`).

---

## Verification for both

- Dispatch two requests together under one driver, then confirm in Bubble that
  **both** `request` rows and **every** tool across both moved — a partial
  write here is the failure mode the synchronous list-change design exists to
  prevent, so check it deliberately.
- Offload one of them and confirm `tools.location` now equals the job's `name`
  **exactly**, then confirm the Pickup flow's job picker returns those tools
  for that job. That round trip is the real proof the location lifecycle works.
- The other dispatched request must still read `In Transit` and still appear on
  its driver's manifest.
- The Tools dashboard groups the delivered tools under the job and the
  in-transit ones under the **driver's name** (its location grouping has no
  special-casing beyond `NO_LOCATION`, so this needs no dashboard change).

Writes hit the **live** database.

---

## Known limits, carried from 2A

- **Return-to-warehouse is out of scope.** Once dispatched, a mistake is
  repaired in Bubble. Dispatch now overwrites `location` with the driver's
  name rather than leaving it at `Warehouse`, so a manual revert has to reset
  `location` back to `"Warehouse"` explicitly — it no longer already reads
  that on its own.
- ~~**Site-to-site redeployment isn't supported.**~~ **Lifted by 2D** —
  see [`phase-2d-site-to-site-transfers.md`](./phase-2d-site-to-site-transfers.md).
  Dispatch no longer assumes a warehouse origin: an off-site tool is left out
  of the dispatch write entirely and moves only when a driver confirms picking
  it up. Note the knock-on for this section's "What it writes" — dispatch now
  updates a **subset** of a request's tools, not all of them.
- `ALLOW_DEV_LOGIN=true` "checks nothing" per `CLAUDE.md`. These two slices
  move physical inventory and can make a tool hard to find. They shouldn't
  reach real users while dev-login is on.
