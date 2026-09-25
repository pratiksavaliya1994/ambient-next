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

## Scope

**In:** the components below. **Out:** anything backend. Same binding UI rules as
[5C](./phase-5c-delivery-frontend-catalogue-assign.md#binding-ui-rules).

---

## 1. Pickup form

`components/pickup-request-form.tsx` (22KB — **extract**, don't grow it) and
`components/combined-pickup-card.tsx` replace their free-text materials with
5C's `material-lines-field.tsx` + `material-picker-dialog.tsx`, in a
`mode="pickup"` variant:

- **No suggestions.** Nothing is pre-filled — not from the job, not from past
  deliveries, not from the `materials` defaults. Unlike the tool pickup picker,
  there is no site inventory to list. The empty state says so: "Add what's on
  site to bring back".
- Stock is **not shown** in the inventory tab — it's irrelevant to what's on a
  site, and showing it invites reading it as a limit.
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

## 4. Request page

`components/request-materials-card.tsx`: for a pickup, each line shows the
estimate, **collected** (the count, once loaded) and **returned** (once
dropped), with the **Not picked up** flag from `listLineTripFlags` after a skip.

---

## Tasks

- [ ] 1. `mode="pickup"` on the material field and picker
- [ ] 2. Pickup form + pickup page; combined pickup card + combined page
- [ ] 3. Delete the free-text components and unused defaults code (search first)
- [ ] 4. Approve-only pickup lines on the assign page
- [ ] 5. Run-sheet count input, stop actions gating, confirm dialog, labels
- [ ] 6. PDF "Collected" blank
- [ ] 7. Request page pickup progress
- [ ] 8. `npm run typecheck` once, at the end

## Verification

Checked by the user in the browser. Suggested pass using 5F's test rows:

1. The pickup form offers no pre-filled lines; a line with a typed estimate
   submits; the combined page's pickup half does too.
2. The assign page shows approve toggles only for the pickup; approving changes
   no stock on `/materials`.
3. Run sheet: Done here stays disabled until every pickup line has a count; a
   count above the estimate is called out in the dialog.
4. After unloading at the yard, `/materials` shows the stock rise and a `Return`
   history row linked to the request.
5. A skipped line shows **Not picked up** on the request page and returns to the
   builder's pool.
6. Tool pickups and deliveries still behave exactly as before.
