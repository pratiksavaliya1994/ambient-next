# Phase 5G — pickup frontend: pickup form, approve, driver counts

Part of [phase 5](./phase-5-materials.md). Built against
[5F](./phase-5f-pickup-backend.md) — **no new backend**. After this slice the
material flow is complete in both directions.

## Goal

1. The pickup form (and the combined page's pickup card) take material lines,
   entered by hand.
2. The assign page approves pickup lines.
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

## 2. Approve on the assign page

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

- [ ] 1. `mode="pickup"` on the material field and picker
- [ ] 2. Pickup form + pickup page; combined pickup card + combined page
- [ ] 3. Delete the free-text components and unused defaults code (search first)
- [ ] 4. Approve-only pickup lines on the assign page
- [ ] 5. Run-sheet count input, stop actions gating, confirm dialog, labels
- [ ] 6. PDF "Collected" blank
- [ ] 7. Request page pickup progress
- [ ] 8. Pickup form site hint (`listSiteStockAction` on job pick, Take all)
- [ ] 9. `assign-transfer-sources.tsx`; coverage in `assign-material-line.tsx`
      and `use-material-targets.ts`; linked lines read-only on a pickup's
      assign page
- [ ] 10. Transfer badges and labels: builder, run sheet, confirm dialog, PDF
- [ ] 11. Request page transfer rows; site page "open pickups from this site"
- [ ] 12. `npm run typecheck` once, at the end

## Verification

Checked by the user in the browser. Suggested pass using 5F's test rows:

1. The pickup form offers no pre-filled lines. After picking a job with site
   material, that site's items list first with "Delivered, not picked up" and
   Take all works. A line with a typed estimate submits, and so does the
   combined page's pickup half.
2. The assign page shows approve toggles only for the pickup; approving changes
   no stock on `/materials`.
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

