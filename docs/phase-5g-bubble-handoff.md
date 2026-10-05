# Phase 5G — Bubble Studio hand-off (optional clean-up)

Companion to [`phase-5g-pickup-frontend.md`](./phase-5g-pickup-frontend.md).

**5G needs no Bubble change.** The Next.js half works against Bubble exactly as
5F left it. This sheet is one **optional** clean-up, which can be done any time
or not at all.

---

## Context

- The Bubble app is `cfaner`, and `version-test` is the live version. Treat
  every test as a real write.
- `new-pickup-request` (public) creates a pickup request. Since 5F it takes
  `materialLines` (a text list, `kind::materialID::name::unit::quantity::materials`)
  and fans out `create-requested-material` to write one **structured**
  `requestedmaterials` row per line.
- It also still has the old **legacy-row step**: it writes one
  `requestedmaterials` row from the `materials` text parameter, with `kind`
  empty. The 5F build sheet kept this step on purpose ("Leave these alone").
- `new-request` (deliveries) had the same step. **It was disabled on
  2026-09-25** (5B §1.4), because nobody uses the old Bubble UI.

## What changed in 5G

The pickup form no longer has a free-text materials box. The `materials` text
Next.js sends to `new-pickup-request` is now **only the summary of the
structured lines**, e.g. `Level-Flor: 10 bag`, or empty when there are no lines.

So for every pickup with material lines, the legacy step writes an extra row
that repeats the lines. Next.js already hides it: `listMaterialLines` drops a
request's legacy row whenever structured lines exist. The extra row is harmless,
but it is dead data.

---

## The optional change — disable the legacy-row step in `new-pickup-request`

Do it the same way it was done on `new-request`.

1. **Backend workflows → `new-pickup-request`.**
2. Find the step that **creates a `requestedMaterials`** thing from the
   `materials` parameter. It's the one that is **not** the *Schedule API
   Workflow on a list → `create-requested-material`* step added in 5F.
   - Open `new-request` beside it. Its disabled step is the same one.
3. **Disable** that step (right-click → *Disable*), rather than deleting it,
   so it's easy to turn back on.
4. **Leave everything else alone**, in particular:
   - the `materialLines` fan-out to `create-requested-material`;
   - the `materials` parameter itself (Next.js still sends it);
   - `status = "Assigned"` on the create step;
   - every tool step (`toolIds`, `toolStatusUpdates`).
5. Deploy to `version-test` as usual.

### Check

Use a test job and note the request id. This is a real write.

1. Create a pickup from `/requests/new/pickup` with one catalogue line and no
   tools.
2. `GET /api/1.1/obj/requestedmaterials?constraints=[{"key":"requestID","constraint_type":"equals","value":"<id>"}]`
   - **Expected:** one row, with `kind = Inventory`.
   - **Before the change** there were two rows: that one, and a row with
     `kind` empty whose `materials` repeats the line.
3. The request page shows the line once, with no "Materials (legacy note)"
   block. That is true either way, so it only shows nothing broke.

### If you skip it

Nothing breaks. Each new pickup with materials keeps writing one legacy row
that no screen shows.

## Built as

_Fill in once done: date, and whether the step was disabled or left on._
