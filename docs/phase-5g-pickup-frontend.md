# Phase 5G — pickup frontend: pickup form, driver counts

Part of [phase 5](./phase-5-materials.md). Built against
[5F](./phase-5f-pickup-backend.md) — **no new backend**. After this slice the
material flow is complete in both directions.

## Goal

1. The pickup form (and the combined page's pickup card) take material lines,
   entered by hand.
2. ~~The assign page approves pickup lines.~~ Dropped 2026-10-05: pickup
   lines need no approval (see *As built*).
3. The run sheet asks the driver to count pickup lines at the collect stop.
4. The request page shows pickup line progress.
5. The old free-text material components are deleted.
6. **Added 2026-09-28:**
   - the pickup form shows what the site has been sent, as a hint;
   - a delivery's assign page links pickup lines from other sites (site-to-site
     transfer);
   - the builder, run sheet, PDF, request page and site page show where a
     linked line is going.

   Built against 5F §2.6.

## Scope

**In:** the components below. **Out:** anything backend. Same binding UI rules as
[5C](./phase-5c-delivery-frontend-catalogue-assign.md#binding-ui-rules).

---

## 1. Pickup form

`components/pickup-request-form.tsx` (22KB — **extract**, don't grow it) and
`components/combined-pickup-card.tsx` replace their free-text materials with
5C's `material-lines-field.tsx` + `material-picker-dialog.tsx`, in a
`mode="pickup"` variant:

- **Site hint, not a pre-fill** *(revised 2026-09-28; was "no suggestions")*.
  When the job is picked, the job field's change handler calls 5F's
  `listSiteStockAction(job)`. It's an event handler, not a `useEffect`: the
  pick is the event. The inventory tab then lists that site's items **first**,
  each with **"Delivered, not picked up: 12 bags"** and a **Take all** shortcut
  that sets the estimate to that figure.
  - Nothing is added to the form until the PM picks.
  - Nothing is enforced: any active item can still be added at any quantity.
  - Changing the job clears the hint and re-reads it.
  - A failed read hides the hint and doesn't block the form.
  - Still nothing from the `materials` defaults.

  The empty state: "Add what's on site to bring back".
- **Warehouse** stock is **not shown** in the inventory tab. It's irrelevant to
  what's on a site, and showing it invites reading it as a limit. The site
  figure is shown, labelled as above so it can't be read as a count.
- Quantity is required for inventory and optional for other items, as for
  deliveries, labelled "about how many" — it's an estimate.
- Only active catalogue items are offered; anything else goes in as an other item.

`app/(app)/requests/new/pickup/page.tsx` and `…/combined/page.tsx` load
`listMaterialItems()` server-side and pass it down.

Then **delete `components/materials-field.tsx` and
`components/material-dialog.tsx`**, and `defaultMaterialsFor` in
`lib/bubble/reference-types.ts` / the `materials` read in `reference.ts` if
nothing else uses them — check with a search first. The Bubble `materials` table
stays; only this app stops reading it.

## 2. Approve on the assign page — dropped 2026-10-05

> **Superseded.** The user ruled that pickup material lines need no approval,
> the same as a pickup's tools. A pickup's assign page now redirects to the
> request page. The text below is the original plan, kept for the record.

`components/assign-material-line.tsx` (5C) renders pickup lines with only the
**Approve / Approved** toggle for both kinds — no stepper, no stock. The card's
title reads "Materials to collect" for a pickup request.

A **linked** pickup line reads **"→ Site B · for delivery …"**, linking to that
request's assign page. Its toggle is disabled: it's approved because it's
linked, and unlinking is done from the delivery side.

## 2a. Transfers on a delivery's assign page (added 2026-09-28)

Server reads, streamed inside the Materials card's existing `<Suspense>`:
`listTransferSources` and `listLinkedPickupLines` (5F §2.6).

| File | Role |
| --- | --- |
| `components/assign-transfer-sources.tsx` (new) | Under each **inventory** delivery line: a "From pickups" list. Each source shows its site, "about 6 bags", its pickup's date, and a **Link / Linked** toggle. Each toggle calls `linkTransferAction` / `unlinkTransferAction` **immediately** and toasts, rather than waiting for the card's Save, because it's a separate write with its own guards. Refusals are shown as-is. Nothing appears when there are no sources |
| `components/assign-material-line.tsx` | Shows **coverage**: "requested 10 · from pickups ~6 · from stock 4". The stepper's upper bound becomes `min(requested − linked coverage, assigned + stock)`, from `lineProgress`'s coverage. "Fill from stock" fills only what the transfers don't cover |
| `hooks/use-material-targets.ts` | Takes linked coverage into its bounds, so the draft and the action agree |

After a link or unlink the page revalidates, so the draft picks up the new
bound. A draft above the new bound is clamped on the next render, derived and
not stored.

Non-inventory lines and closed requests get no "From pickups" list.

## 3. Run sheet — counting

| File | Change |
| --- | --- |
| `components/trip-stop-material-line.tsx` (5E) | At a **collect** stop for a pickup line: a number input "Collected" (whole numbers ≥ 0), empty until the driver types, with the estimate beside it ("about 10 bags"). `0` renders the line as *not collected*. Delivery lines keep the checkbox |
| `components/trip-stop-actions.tsx` | Sends `counts` for pickup lines. **Done here stays disabled until every pickup line at the stop has a count** — an empty field is a question not yet answered, not a zero |
| `components/trip-stop-confirm-dialog.tsx` | Lists counts, and calls out a count above the estimate ("12 — more than the 10 expected") and zeros ("not collected: 1 line") |
| `lib/trips/stop-labels.ts` | "Collect 2 tools, 3 materials" |

At the yard the pickup line is a plain tick, like any drop; the dialog says what
goes back into stock ("+7 bags Level-Flor to stock"), and the unload shows on
`/materials` history as a `Return`.

The PDF (5E) needs a blank "Collected: ____" next to each pickup line, for
drivers working from paper.

**Transfers on the trip screens** *(added 2026-09-28)*:

- **Builder** (`trip-material-row.tsx`, 5E): a linked pickup line shows a
  **"→ Site B"** badge. The group's warehouse picker says it applies to "the
  rest", since the linked line's destination is fixed.
- **Run sheet** (`trip-stop-material-line.tsx`): at B, a transfer row is a
  plain drop tick labelled "from Site A · 6 counted". Unticking refuses it, as
  for a delivery. The confirm dialog says "+6 bags to Site B" for a drop and
  "refused — goes back to the warehouse" for a refusal. At the collect stop it
  is counted like any pickup line, and the dialog adds "then to Site B".
- **PDF:** "→ Site B" beside a linked pickup line, and "from Site A" at B's
  drop.

## 4. Request page

`components/request-materials-card.tsx`: for a pickup, each line shows the
estimate, **collected** (the count, once loaded) and **returned** (once
dropped), with the **Not picked up** flag from `listLineTripFlags` after a skip.

For a transfer *(added 2026-09-28)*:

- **Pickup line:** reads "→ Site B" (with a link) instead of "to the
  warehouse". After a refusal at B it reads "refused at Site B — back at the
  warehouse".
- **Delivery line:** gains a sub-row per linked pickup: "From Site A pickup:
  about 6 · collected 6 · delivered 6". Its totals use `lineProgress`'s
  coverage and delivered.

## 5. Site page (added 2026-09-28)

`/sites/[jobId]` (5E; moved from `/materials/sites/[jobId]` 2026-09-29 when it
gained the site's tools) gains **"Open pickups from this site"**. Each
open pickup line from that job shows its estimate, and where it's going (the
warehouse, or "→ Site B"), linking to the request. It's read from the same
`listMaterialLines` over the job's open pickup requests.

---

## Tasks

- [x] 1. `mode="pickup"` on the material field and picker
- [x] 2. Pickup form + pickup page; combined pickup card + combined page
- [x] 3. Delete the free-text components and unused defaults code (search first)
- [x] 4. Approve-only pickup lines on the assign page
- [x] 5. Run-sheet count input, stop actions gating, confirm dialog, labels
- [x] 6. PDF "Collected" blank
- [x] 7. Request page pickup progress
- [x] 8. Pickup form site hint (`listSiteStockAction` on job pick, Take all)
- [x] 9. `assign-transfer-sources.tsx`; coverage in `assign-material-line.tsx`
      and `use-material-targets.ts`; linked lines read-only on a pickup's
      assign page
- [x] 10. Transfer badges and labels: builder, run sheet, confirm dialog, PDF
- [x] 11. Request page transfer rows; site page "open pickups from this site"
- [x] 12. `npm run typecheck` once, at the end

## As built (2026-10-05)

**Built, and it typechecks clean. Not checked in the browser yet. No backend
change was needed.** One optional Bubble clean-up is written up in
[`phase-5g-bubble-handoff.md`](./phase-5g-bubble-handoff.md); nothing here
depends on it.

Where the build differs from the sections above, or adds to them:

- **The pickup free text is gone** (5F left the call to 5G). `materials` left
  `pickupRequestFormSchema`, and `pickupMaterials` left the combined schema;
  both refines are now "a tool or a material line". `buildSummary` and the
  request payload lost their free-text `materials` input, so the legacy text
  and the WhatsApp list are the lines' summary only.
- **The pickup form was extracted**, not grown. 562 lines became:
  - `hooks/use-pickup-request.ts`, the state and handlers, as
    `useCombinedRequest` already does for the combined page;
  - `pickup-request-details.tsx` and `pickup-request-fieldsets.tsx`, the left
    card;
  - `pickup-request-items-card.tsx`, tools, materials and submit;
  - `pickup-request-form.tsx`, now a thin shell.
  `pickup-tools-controls.tsx` holds the Select all / Clear all actions and the
  Cleanup switch, now shared with the combined pickup card. The job type's
  old "Sets the default materials list" hint went with the defaults.
- **The site hint** is `hooks/use-site-stock-hint.ts`, loaded from the
  job-change handler on both pages. A slower answer for a job no longer
  picked is dropped.
- **The pickup picker offers every active item, not the job type's.** A site
  can hold anything, so the job-type filter is a delivery thing. The site's
  items sort first. The inventory tab moved into `material-inventory-list.tsx`.
- **Deleted:** `materials-field.tsx`, `material-dialog.tsx`,
  `defaultMaterialsFor`, `MaterialDefault` and `listMaterialDefaults`. A search
  found no other callers. The Bubble `materials` table is untouched.
- **Assign page:**
  - `assign-approve-line.tsx` (new) is the approve-only row for non-inventory
    delivery lines. `AssignMaterialLine` is now the inventory delivery line
    only.
  - The draft clamps **down** only, as it's read. A line assigned above its
    new bound before a link may keep that value, since the action allows any
    decrease, but it can't go higher.
  - `AssignedMeta` moved to `request-material-line.tsx`.
- **The run-sheet count is not on `TripStopMaterialLine`.** As 5E built it,
  that row is the record and the choices live in the stop's actions, so the
  "Collected" inputs are a new `TripStopCountList` beside the checklists.
  - **Counts are prefilled with the estimate** (user request, 2026-10-05;
    §3 said "empty until the driver types"). `useStopChoices` keeps only the
    numbers the driver changed. A field they clear is unanswered, and the
    button reads "Count 1 material first" until it's filled again.
  - `0` goes to `skipMaterialIds`, so the action's own 0-to-skip rule isn't
    relied on.
  - The checklist state moved into `hooks/use-stop-choices.ts`, to keep
    `TripStopActions` under 100 lines.
- **Which rows are pickups, client-side:** `isPickupMaterial` reads a row's
  `fromLocation`. A delivery always leaves a warehouse, and a pickup always
  leaves its job. It drives wording and the count input only. The stop action
  still decides direction from each row's request.
- **Confirm dialog:** `StopRow` gained a `note` that shows on every screen
  size, because the `detail` column is hidden on phones. The notes are the
  over-estimate callout, "Counted 0 — not collected", "then to Site B",
  "+7 bag Level-Flor to stock" and "Refused — goes back to the warehouse".
  The row wording lives in `lib/trips/stop-material-rows.ts`.
- **Stop toast:** `materialsCounted` now counts as collected and
  `materialsLanded` as dropped. Before, both were missing from the sentence.
- **Builder:** a pickup line has no stepper ("about 10 bag · goes whole"), so
  5F's "goes on one trip whole" problem can't be produced any more.
- **Request page:** `RequestMaterialLine` (new) renders one line, and the
  pickup progress and linked sub-rows are in `request-material-progress.tsx`.
  The sub-rows name their source sites through
  `listLinkedPickupSources` in `material-transfers.ts`, which costs one shallow
  request read and only when a delivery has links. The page file didn't grow;
  it is still 501 lines and still needs splitting.
- **Site page:** "Open pickups from this site" is
  `site-open-pickups-card.tsx`, streamed in its own `<Suspense>`. Its read is
  `lib/bubble/site-pickups.ts`, kept out of `requests.ts` because that file is
  over the cap. The read constrains on `request.job` only and filters direction
  in code, so it adds no new kind of constraint. The card renders nothing when
  there are no open pickups.
- **No approval for pickup lines (user decision, 2026-10-05).** The first
  browser pass found a pickup's lines never reached the trip pool: the pool
  skipped `assignedQty = 0`, and nothing could approve them. The user ruled
  that pickup materials need no approval, the same as pickup tools. So:
  - `lineProgress`'s pickup branch counts a line as assigned in full from
    creation (`assigned = requested`, outstanding while idle). `assignedQty`
    stays 0 on pickup lines and is never read for them.
  - The trip pool skips unassigned **delivery** lines only.
  - Status derivation counts the lines as assigned, so a materials-only pickup
    reads `Assigned` — what `new-pickup-request` stamps. `settle-pickup.ts` no
    longer re-syncs it (5F's sync derived `New`).
  - The pickup assign page redirects to the request page. `saveAssignmentAction`
    and `prepareMaterialSave` refuse a pickup. A tool save would replace its
    `assignedtools` rows wholesale.
  - Linking a transfer is now just the `PATCH`, with no approve write.
  - No "Awaiting approval" badges on pickup lines anywhere.
  - **Pickups created before this change read `New`** (5F's sync set it), and
    the trip pool reads only `Assigned` and later. Recreate those test
    requests, or they appear once anything re-syncs them.
- **Second browser pass (2026-10-05), transfers on the assign page:**
  - **Split on link** (user decision): a pickup estimated above what the
    delivery still needs is split, and only the need is linked. See the master
    doc's *Whole-line, split on link*. The row says it before the click:
    "2 here, ~1 to the warehouse" and "Transfer 2 bag to this site". A covered
    line offers "Not needed".
  - **Clearer labels:** "Pickups at other sites — send here instead of the
    warehouse", **Transfer to this site**, and once linked "Coming here from
    this pickup" plus a separate **Cancel transfer**.
  - **The save bar** is now `assign-save-bar.tsx`, out of the over-cap panel.
    With nothing unsaved it reads "Everything is saved — transfers save as
    soon as you choose them" and offers **Back to request**, instead of a
    disabled Save. It no longer prints "0 assigned · 0 requested" on a request
    with no tool slots.
  - **Not verified live:** the split is the first Data API `POST` to
    `requestedmaterials`. If Bubble refuses it, the link fails before anything
    changes.
- **"Add to a trip" for a delivery fed by transfers** (third browser pass,
  2026-10-05). A delivery covered only by transfers has no warehouse units of
  its own, so the button never showed. The request page now counts linked
  pickup lines that no trip holds yet. `OutstandingMaterial` gained
  `feedsRequestId`, so `/trips/new?requestId=<delivery>` also ticks those
  lines in their pickup's group, and only those — not the pickup's other lines.
- **Still over the 300-line cap, touched only lightly:**
  - `assign-tools-panel.tsx` (+1 line, `coverage` into the hook);
  - `requests.ts` (smaller than before);
  - the request detail page.

## Verification

Checked by the user in the browser. Suggested pass using 5F's test rows:

1. The pickup form offers no pre-filled lines. After picking a job with site
   material, that site's items list first with "Delivered, not picked up" and
   Take all works. A line with a typed estimate submits, and so does the
   combined page's pickup half.
2. A new pickup reads `Assigned` straight away, and its lines are in the trip
   builder's pool without any approval. The request page offers no assign
   button.
3. Run sheet: Done here stays disabled until every pickup line has a count; a
   count above the estimate is called out in the dialog.
4. After unloading at the yard, `/materials` shows the stock rise and a `Return`
   history row linked to the request.
5. A skipped line shows **Not picked up** on the request page and returns to the
   builder's pool.
6. Tool pickups and deliveries still behave exactly as before.
7. **Transfer**, using 5F's transfer test rows:
   - B's assign page lists A's pickup under the line. Link it → the coverage
     and the stepper bound update, and A's assign page shows the line as
     "→ Site B", read-only.
   - The builder shows the badge, and the run sheet shows "from Site A" at B.
   - After the drop, `/materials/sites` shows A down and B up.
   - Both request pages show the transfer.

