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
6. **Added 2026-09-28 — the site view:**
   - what each job site has been sent and not sent back, in a layout like the
     Job Dashboard;
   - a page per site;
   - a "where it is" card on each item.

   See §5.

## Scope

**In:** the components below. **Out:** pickup quantity entry, and every
transfer screen (5G).

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

## 5. Site view (added 2026-09-28)

Reads 5D §2.7's `listSiteStock` / `listSiteHistory`; no backend here. The
templates are the Job Dashboard (`app/(app)/tools/page.tsx`,
`components/tools-dashboard.tsx`) and 5C's `/materials` screens.

**Wording is binding.** The figure is **"Delivered, not picked up"**, never "on
site" or "in stock". Use on site isn't tracked (master doc, decision 9), so it
is an upper bound. The page's one-line blurb says so.

| Route | Server component reads | Client island |
| --- | --- | --- |
| `/materials/sites` | `listSiteStock()`, grouped with `groupBySite` | `materials-by-site.tsx`: one card per site, newest movement first. Each card shows its items with qty + unit and "last moved". Search matches site or item name, filtering in the browser as the Job Dashboard does. The card header links to the site page |
| `/materials/sites/[jobId]` (now `/sites/[jobId]`, which also lists the tools at the site via `listToolsForJob`; the old path redirects) | the job (by `_id`, from the memoised jobs reference list, so the URL never carries a job name), `listSiteStock({ location: job.name })`, `listSiteHistory(job.name)` | the item list, and `material-stock-history.tsx` reused, filtered to that site. 5G adds "open pickups from this site" |
| `/materials/[itemId]` | + `listSiteStock({ materialIds: [id] })` | new `material-where-it-is.tsx`: the warehouse (`stockQty`) and then every site with qty > 0, each linking to its site page |

- **`/materials` gets a Warehouse / By site switch** (two links styled as a
  segmented control) above the catalogue. The sidebar keeps its one
  **Materials** entry.
- **`material-stock-history.tsx`** (5C) gains a **location** column: "Warehouse"
  when empty, else the site name linked to its site page. It also gets badges
  for `Deliver` and `Collect` from the existing status tokens. `stockAfter` is
  labelled per location ("after, at this location"), because the item page now
  mixes warehouse and site rows.
- `loading.tsx` for both new routes. `app/(app)/materials/error.tsx` already
  covers the subtree. There is an empty state for no sites yet ("Nothing has been
  delivered to a site yet").
- `jobId` not found → `notFound()`.

---

## Tasks

- [x] 1. `trip-material-row.tsx`; group, pool and builder selection state
- [x] 2. Plan preview, sortable list, stop row counts
- [x] 3. `trip-stop-material-line.tsx`; stop items, actions, confirm dialog,
      `stop-labels.ts`
- [x] 4. Trip card, driver card
- [x] 5. PDF material lines
- [x] 6. Request page line progress and flags
- [x] 7. `/materials/sites` + `materials-by-site.tsx` + the Warehouse / By site
      switch
- [x] 8. `/materials/sites/[jobId]`
- [x] 9. `material-where-it-is.tsx` on the item page; location column + new
      badges in `material-stock-history.tsx`
- [x] 10. `npm run typecheck` once, at the end

## As built (2026-09-29)

Built and typechecks clean. Not checked in the browser yet.

Where the build differs from the tables above, or adds to them:

- **`trip-stop-sortable-list.tsx`, `trip-stop-row.tsx` and `driver-trip-card.tsx`
  are unchanged.** They belong to the old per-driver dispatch board
  (`ActiveTrips`, built on `DispatchRequestSummary`), which nothing renders
  since `/dispatch/active` became a redirect. The builder's sortable stops live
  in `trip-plan-preview.tsx`, and that file carries the material counts and
  the `material-order` flagging.
- **The run-sheet line has no checkbox.** As for tools, ticking and unticking
  happen in the stop's checklist (`TripStopChecklist`), where material lines
  are rows like any tool, labelled with the quantity first ("20 bag
  Level-Flor"). `TripStopMaterialLine` is the record: name · qty + unit · kind
  · the tool state chip (`StateChip`, now exported).
- **`lib/trips/stop-checklist.ts`** (new) builds every list `TripStopActions`
  sends, tools and lines alike, from one `unticked` set. That works because
  tool ids and line ids are both Bubble ids and never collide, and each is on
  only one side of a stop. `TripStopChecklist` and `TripStopConfirmDialog` now
  take its generic `StopRow` (`id`, `label`, `detail?`).
- **Builder split:** `TripDraft` and `deriveInitialSplitPreference` moved to
  `lib/trips/trip-draft.ts` (with `initialMaterialSelection`), and the
  `Map<lineId, qty>` state lives in `hooks/use-material-selection.ts`. Doing
  this took `trip-builder.tsx` back under 300 lines. A ticked line starts at
  all of what's left, and the group's "All" ticks lines as well. A saved qty
  now above what's left shows `invalidMaterialMessage` as the builder's
  blocking problem, the same sentence the server refuses with.
- **Tools-only wording is unchanged** everywhere: button, toast, pool, cards,
  PDF. Materials add their own phrase only when present ("drop off 3 tools, 2
  materials").
- **Run sheet:** Finish trip's local guard now counts material rows still on
  the truck, so the button stays disabled rather than letting the action
  refuse.
- **Request page:** the lines' trip rows are read once
  (`listTripMaterialsForLines`), feeding both `lineProgress` and a new pure
  `lineTripFlags(rows)` in `tripmaterial-read.ts`. `listLineTripFlags` now
  wraps it. "On trips" shows what's still moving (`onTrips − delivered`), so
  delivered units aren't counted twice. "Add to a trip" counts
  `outstandingMaterialsFor(…)` lines, which is the pool's own rule. The page
  was already over the 300-line cap before this slice (now 497) and still
  needs splitting.
- **Site links:** `siteJobIds(locations)` in `site-stock.ts` maps site names to
  `jobs._id` off the memoised jobs list. A location matching no job renders
  unlinked.
- **`MaterialStockHistory`** gains `siteLinks`, `itemUnits`, `showItem` and
  `emptyDescription`. The site page uses the last three, since its history
  mixes items.

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
7. **Site view:** after that drop, `/materials/sites` shows the job with 20 of
   the item.
   - The site page lists it, with a `Deliver` history row.
   - The item page's "where it is" shows the warehouse figure and the site.
   - The refused run in step 4 added nothing to any site.
