# Phase 5E — delivery frontend: materials in the builder, run sheet and PDF

Part of [phase 5](./phase-5-materials.md). Built against
[5D](./phase-5d-delivery-backend-trips.md) — **no new backend**. After this slice
the delivery flow is complete end to end.

## Goal

1. The trip builder's pool shows each request's outstanding material lines next
   to its tools, with a quantity to send.
2. The route preview and stop list include materials.
3. The run sheet lets the driver load, drop, skip and refuse material lines, and
   unload refused ones at the yard.
4. The trip card, the driver card and the PDF count and list materials.
5. The request page shows each line's trip progress and flags.

## Scope

**In:** the components below. **Out:** pickup quantity entry (5G).

Same binding UI rules as [5C](./phase-5c-delivery-frontend-catalogue-assign.md#binding-ui-rules)
— base-nova, size caps, no `useEffect`, loading and error states.

---

## 1. Trip builder

`components/trip-builder.tsx` holds the selection as tool ids today. It gains a
second piece of local state, **`Map<lineId, qty>`**, and passes both to
`planTrip(movements, options, materials)` on every change — the same function the
server runs, so the preview is the plan.

| File | Change |
| --- | --- |
| `components/trip-movement-group.tsx` | Renders the group's material lines under its tools, headed "Materials" |
| `components/trip-material-row.tsx` (new) | Checkbox · name · kind badge · "**8** of 12 left" · qty stepper (1..outstanding, defaulting to all of it when ticked). Kept separate from `trip-movement-row.tsx`, which is tool-shaped and already 7KB |
| `components/trip-movement-pool.tsx` | Counts ("3 tools · 2 materials selected"); a group with only materials still renders |
| `components/trip-plan-preview.tsx` | Per stop, "drop 3 tools, 2 materials"; `duplicate-line` and ordering problems render with the existing problem styling |
| `components/trip-stop-sortable-list.tsx` / `trip-stop-row.tsx` | Counts include materials; drag behaviour unchanged |

`?requestId=` on `/trips/new` seeds that request's movable **tools and lines**.

Server refusals (qty now over outstanding because another dispatcher planned it)
come back from the action by name and are shown as-is; the builder doesn't
second-guess them.

## 2. Run sheet

| File | Change |
| --- | --- |
| `components/trip-stop-items.tsx` | Lists a stop's material collects and drops beside the tool ones, from `StopWork.collectMaterials` / `dropMaterials`; `refusedMaterials` as the existing "refused here" display rows |
| `components/trip-stop-material-line.tsx` (new) | One line: name · **qty + unit** · kind · state chip (reusing the tool state chip colours). Checkbox when outstanding. Refuse is the same untick gesture as for a tool, offered only where `refusable` says so (never at a warehouse) |
| `components/trip-stop-actions.tsx` | Builds the material `ticked`/`refused` lists alongside the tool ones and sends them in the one `completeStopAction` call. Stays under 100 lines per component — split the list-building into a hook-free helper in `lib/trips/` if it grows |
| `components/trip-stop-confirm-dialog.tsx` | The summary includes "drop 20 bags Level-Flor", "refused: 2 lines" |
| `lib/trips/stop-labels.ts` | Button label and toast count materials ("Drop 3 tools, 2 materials") |
| `components/trip-stop-card.tsx` | Done tick uses the extended `isStopDone` (no local logic) |

Delivery lines are **tick-only**, by decision: no quantity input on the run
sheet in this slice.

Finish trip: the "still on the truck" message from `completeTripAction` now names
materials; it is shown as-is.

## 3. Cards and PDF

- `components/trip-card.tsx`, `components/driver-trip-card.tsx` — route line
  unchanged; counts become "5 tools · 2 materials".
- `lib/trips/pdf/pdf-stop-block.tsx` + a new `pdf-material-line.tsx` — each stop
  lists materials with qty and unit under its tools, collect and drop sections as
  for tools. `app/(app)/trips/[tripId]/pdf/route.tsx` needs no change beyond the
  data `getTrip` now returns.

## 4. Request page

`components/request-materials-card.tsx` (from 5C) gains, per line: **on trips**
and **delivered** counts from `lineProgress`, and the `listLineTripFlags` badges —
amber **Refused** and **Not loaded**, the tool flags' wording and colours. **Add
to a trip** already links to `/trips/new?requestId=`; it now shows when a request
has outstanding lines even with no movable tools.

---

## Tasks

- [ ] 1. `trip-material-row.tsx`; group, pool and builder selection state
- [ ] 2. Plan preview, sortable list, stop row counts
- [ ] 3. `trip-stop-material-line.tsx`; stop items, actions, confirm dialog,
      `stop-labels.ts`
- [ ] 4. Trip card, driver card
- [ ] 5. PDF material lines
- [ ] 6. Request page line progress and flags
- [ ] 7. `npm run typecheck` once, at the end

## Verification

Checked by the user in the browser. Suggested pass using 5D's test rows:

1. A tools-only trip looks exactly as before in the builder, run sheet and PDF.
2. Tick a line, lower its qty, tick a tool for the same site → one stop, preview
   says "1 tool, 1 material". Save; reopen the editor — qty kept.
3. Another tab plans the rest of the line; saving the first tab's larger qty
   is refused with the line named.
4. Run sheet: start → the line shows loaded; untick it at the job → refused chip
   at the job, and the line appears at the next warehouse stop (or the
   synthesised return stop). Unload it there → stock on `/materials` went up by
   the qty, and the request page shows **Refused**.
5. PDF lists the line with qty and unit under the right stop.
6. The whole delivery: request → assign → trip → drop → the request reads
   `Delivered` with its lines "delivered 20 of 20".
