# Manual trip stops

A client request (2026-09-29): the dispatcher can add a stop to a trip by hand, a
job the driver must visit that no picked tool or material needs yet. When a tool
or material for that job is picked later (in the builder or in edit), it lands in
that stop. The driver marks a stop with nothing at it as done.

Read [`phase-4-trips.md`](./phase-4-trips.md) first. Every rule there still holds.

## Decisions

- **Any job on file.** The builder's "Add stop" popup is a combobox over `jobs`.
  The action checks the name against `jobs` again (`buildPlan`).
- **A manual stop is marked by its key: `<job name>#manual`.** No field.
  `manualLocationsOf` reads the manual stops back off the saved keys on the edit
  page, so a manual stop stays on the route after its last tool is removed.
- **Cargo for the same job joins the manual stop.** `withManualStops` re-keys
  the planner's unsplit stop at that job to the manual key, and every row
  pointing at it follows. A job the planner already split into two visits is
  left alone.
- **A draft can be manual stops only.** It saves, but `startTripAction` refuses
  to start it, and the run sheet's Start button is disabled with a hint.
- **Done on an empty stop is stored in `tripstop.doneAt`.** Every other stop's
  done-ness is still derived from its rows (`isStopDone`). Rows can't be added
  once a trip is running, so the flag can't go stale.

## 1. Bubble Studio — additive only

**Save these before the app ships.** Until they exist, a trip still plans,
saves and runs, but pressing "Mark as done" returns a workflow error.

### 1.1 Field

`tripstop` gains **`doneAt`** (date). Leave it empty on every existing row.
`create-trip-stop` does **not** set it, so a saved or re-saved stop starts
empty. `save-trip` only runs on `Planned` trips, which is before anything can be
marked done.

### 1.2 `mark-trip-stop-done` (exposed)

Backend workflow → API workflow, exposed, auth "User & admin" (same as
`complete-trip-stop`).

| Parameter | Type |
| --- | --- |
| `tripId` | text |
| `stopKey` | text |

**Endpoint-level *Only when*:** `Search for trips (unique id = tripId):first
item's status is "In Transit"`. Same guard as `complete-trip-stop`: when it's
false, Bubble answers `200` with an empty body, and Next.js reads that as the
refusal.

Let *S* = `Search for tripstops (tripID = tripId, stopKey = stopKey)`.

1. *Make changes to a thing* → `S:first item`: `doneAt = Current date/time`.
   **Only when** `S:first item's doneAt is empty`, so a replay keeps the first
   time.
2. *Return data from API*: `{ "ok": yes, "stops": S:count }`.

Next.js throws unless `ok` is true and `stops` is exactly 1.

### 1.3 Nothing else changes

`create-trip` and `save-trip` are unchanged. A manual-only draft sends empty
`items` and `materials` lists, so check once that neither workflow fails on an
empty list. The step conditions from 5D should already cover this, since a
materials-only trip sends empty `items`.

## 2. Next.js — as built (2026-09-29)

| File | Change |
| --- | --- |
| `lib/trips/manual-stops.ts` (new, pure) | Key helpers, `withManualStops`, `renameInOrder`, `isEmptyStopWork`, `isEmptyPlannedStop` |
| `lib/trips/validate.ts` | `orphan-stop` skips manual stops. `empty` only fires when there are no manual stops either |
| `lib/schemas/trip.ts` | `manualStops` (job names, defaulted `[]`) on create/save. `hasCargo` counts them. `markStopDoneSchema` |
| `app/(app)/trips/actions.ts` | `buildPlan` checks the names against `jobs` and applies `withManualStops` after `planTrip` |
| `lib/trips/trip-draft.ts`, edit page | `TripDraft.manualStops` from `manualLocationsOf(trip.stops)` |
| new + edit pages | Pass `jobs.map(toStopJob)` (no `description`) to the builder |
| `components/trip-builder.tsx` | `manualStops` state; add/remove keep the dragged order via `renameInOrder` |
| `components/trip-route-card.tsx` (new) | The Route card, split from the builder, with the "Add stop" button |
| `components/trip-add-stop-dialog.tsx` (new) | The popup with the job combobox |
| `components/trip-plan-stop.tsx` (new) | The sortable stop, moved out of `trip-plan-preview.tsx`, plus Remove on manual stops |
| `components/trip-driver-panel.tsx` | Save is enabled by `stopCount`, not by the cargo count |
| `lib/bubble/trips-types.ts`, `trips-read.ts` | `TripStop.doneAt`. `isStopDone` on a stop with no rows reads it |
| `lib/bubble/trip-stop-done.ts` (new) | `markTripStopDone` → `/wf/mark-trip-stop-done` |
| `app/(app)/trips/[tripId]/stop-done-action.ts` (new) | `markStopDoneAction`: In Transit only, real and empty stops only |
| `components/trip-stop-mark-done.tsx` (new), `trip-stop-card.tsx` | "Mark as done" in place of the checklist on an empty stop |
| `app/(app)/trips/[tripId]/actions.ts`, `trip-run-sheet.tsx` | Start refused and disabled when the trip carries nothing |

**Tools and materials only trips are unchanged.** With no manual stops,
`withManualStops` returns the plan it was given, so keys, stops and counts are
the same as before.

## Verification

1. **Regression:** a tools-only and a materials-only trip plan, save, start and
   complete exactly as before.
2. New trip: add a manual stop only → Save is enabled. The saved `tripstop` has
   key `<job>#manual`. Start is disabled with the hint, and a direct call to
   `startTripAction` is refused.
3. Edit it: the manual stop is still there. Pick a tool going to that job → it
   shows in the manual stop, not a second one. Save → `triptool.toStopKey` is
   `<job>#manual`.
4. Edit again, untick the tool → the manual stop stays, empty.
5. Add a manual stop at a job that already has a stop → the same card gains the
   Remove button, and keeps its position.
6. Run a trip with an empty manual stop: it shows "Mark as done", the run sheet
   waits on it, and pressing it sets `doneAt`. Pressing it again (a stale tab)
   keeps the first time.
