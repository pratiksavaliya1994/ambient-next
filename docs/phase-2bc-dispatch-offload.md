# Phase 2B / 2C — dispatch and offload

**Not started.** Read [`phase-2-lifecycle.md`](./phase-2-lifecycle.md) first,
then [`phase-2a-assignment.md`](./phase-2a-assignment.md) — 2A must be complete
before either of these begins, because both consume `assignedtools` rows and
both reuse the `update-request-status` workflow it builds.

Neither slice needs a new Bubble field, a new table or a new workflow. The
schema for all of phase 2 lands in 2A.

---

## Open question, to settle before 2B

**Where do driver names come from?** `pms` is 12 **Project Managers**, not
drivers. `request.driver` is free text with the PM list offered as a
convenience, which means it can't be reliably matched against
`tools.currentUser` later. If a real driver roster exists somewhere in Bubble,
find it and use it. Ask before building the picker.

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

`tools.location` is **not** touched — see the lifecycle table in
`phase-2-lifecycle.md` for why.

One call to `update-request-status` with several `requestIds` and the union of
their `toolIds`. The workflow already accepts a list on both.

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

This is the **only** moment in phase 2 that writes `tools.location`. The value
must be the job's `name` exactly, since `listToolsForJob` filters
`location equals jobName` and nothing enforces referential integrity.

One call to `update-request-status` with one `requestId`, the request's
`toolIds`, `toolStatus: "Delivered"` and `toolLocation: job.name`.

### Route

`app/(app)/dispatch/[requestId]/page.tsx` — its **own** route, not a dialog on
the board. This is a different person (the driver), in a different place (the
job site), on a phone. The app is already a PWA (`components/pwa/`,
`app/manifest.ts`). Keep it phone-shaped and cheap: it must not load the 1,445
`jobs` rows to render one button.

Fetching is `getRequest` plus one `in` query for its `assignedtools` rows.

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
  in-transit ones still under `Warehouse`, badged `In Transit`.

Writes hit the **live** database.

---

## Known limits, carried from 2A

- **Return-to-warehouse is out of scope.** Once dispatched, a mistake is
  repaired in Bubble. Adding it later means storing the tool's previous
  `location` at dispatch, which today nothing does.
- **Site-to-site redeployment isn't supported.** A delivery starts at the
  Warehouse by definition here. While a load is in transit, `listToolsForJob`
  returns nothing for it — correct for a warehouse origin, wrong for a move
  between two job sites.
- `ALLOW_DEV_LOGIN=true` "checks nothing" per `CLAUDE.md`. These two slices
  move physical inventory and can make a tool hard to find. They shouldn't
  reach real users while dev-login is on.
