# Phase 5C — delivery frontend: catalogue, request form, assign

Part of [phase 5](./phase-5-materials.md). Built against
[5B](./phase-5b-delivery-backend-catalogue-assign.md)'s actions and data layer —
**no new backend here**. If a screen needs a read or action 5B didn't provide,
add it to 5B's doc and build it there first.

## Goal

1. `/materials` — the catalogue with stock, add/edit, adjust stock, history.
2. The delivery form (and the combined page's delivery card) request material
   lines instead of free text.
3. The request page shows lines with requested / assigned.
4. The assign page gets a Materials card: assign up to stock, partial allowed,
   approve non-inventory lines.

## Scope

**In:** the routes and components below, the sidebar entry.
**Out:** trip screens (5E), the pickup form and the combined page's pickup card
(5G).

## Binding UI rules

From `CLAUDE.md` and the vendored skills — not optional:

- `components.json` is **base-nova** (shadcn on `@base-ui/react`): `render` not
  `asChild`, `items` on `Select`, `toast.add()` from `@/components/ui/toast`.
  Read `.agents/skills/shadcn/SKILL.md` and `rules/base-vs-radix.md` first.
- Forms use `FieldGroup` + `Field`; `gap-*` not `space-y-*`; semantic colour
  tokens; `cn()`.
- **≤100 lines per component, ≤300 per file, ≤3 components per file.** Split
  before finishing, not after.
- Fetch in server components, pass data down; small client islands.
- Loading (`loading.tsx` / `<Suspense>`) and error states are required.
- **No `useEffect`** unless there is genuinely no other way — derive in render or
  handle in the event.
- Nothing is written until submit (the request form's rule since phase 1).

---

## 1. `/materials` — catalogue

Templates: the Tools dashboard (`app/(app)/tools/page.tsx`,
`components/tools-dashboard.tsx`), `/tools/new`, `/tools/[toolId]`.

| Route | Server component reads | Client island |
| --- | --- | --- |
| `/materials` | `listMaterialItems({ includeInactive })` | `materials-catalogue.tsx`: search by name, category filter, "show retired" toggle; each row name · category · **stock + unit** (red when ≤ 0) |
| `/materials/new` | — | `material-item-form.tsx`: name (debounced + on-blur `checkMaterialNameAction`, as `tool-name-field.tsx`), unit, category, related job types, opening stock |
| `/materials/[itemId]` | `getMaterialItem`, `listStockHistory` | the same form in edit mode (no stock field), `material-stock-adjust.tsx`, `material-stock-history.tsx` |

**Adjust stock** is a small card with a two-option toggle — *Receive* (add n) or
*Correct to count* (set to n) — plus notes, and a confirm that states the
result: "Stock goes from 12 to 20". Submit is disabled while pending; a second
press is a second adjustment, which is why the confirm exists.

**History** lists newest first: date, reason badge, signed delta, stock after,
request link when `requestID` is set, by whom. A `Release` and a `Return` read
differently from an `Assign` in colour, using the existing status tokens.

Add **Materials** to `components/app-sidebar.tsx`, next to Tools.

## 2. Request form — material lines

Replaces `components/materials-field.tsx` and `components/material-dialog.tsx`.
Delete both once nothing imports them — the combined pickup card still does until
5G, so **they stay until 5G** and this slice only stops the delivery form and the
combined delivery card using them.

| File | Role |
| --- | --- |
| `components/material-lines-field.tsx` | The list of chosen lines on the form: name, qty + unit, kind badge, remove. Empty state with `border-dashed`, as the tool picker's |
| `components/material-picker-dialog.tsx` | Two tabs. **From inventory**: search the catalogue filtered by `itemsFor(items, toDo)`, show stock, quantity stepper — stock is shown, **not enforced**, since the request is a wish and assignment decides. **Other item**: name/description + optional quantity + optional unit |
| `components/material-line-row.tsx` | One row, shared by the field, the request page and the assign card (read-only variant) |

`app/(app)/requests/new/page.tsx` loads `listMaterialItems()` server-side next to
the tool types and passes it down. `request-form.tsx` keeps `materialLines` as a
`Controller`-managed array, the same way the tool `selected` map is pushed in via
`setValue`. The schema refine ("at least one tool or material line") now drives
the error under the tools/materials column.

The same field goes on `components/combined-delivery-card.tsx`. The WhatsApp
preview, if one is shown, uses `formatMaterialsSummary`.

## 3. Request page

`app/(app)/requests/[requestId]/page.tsx` (23KB — **extract**, don't grow it):
a new `components/request-materials-card.tsx` shows each line as requested ·
assigned (`12 of 20`), with a "short" badge when assigned < requested, and
**Materials (legacy note)** below it when `legacyMaterials` is non-empty. The
page's primary action for a request with un-assigned lines points at the assign
page, as it does for unfilled tool slots.

The `/requests` list cards show a material line count beside the tool count.

## 4. Assign page — Materials card

`app/(app)/requests/[requestId]/assign/page.tsx` gains a second card under the
tools panel, streamed in its own `<Suspense>` so a slow catalogue read doesn't
hold the tools up.

| File | Role |
| --- | --- |
| `components/assign-materials-panel.tsx` | Client island. Local state keyed by line id → target qty, **nothing written until Save**; Save calls `assignMaterialsAction` and toasts the result, including any settle warning |
| `components/assign-material-line.tsx` | One line. **Inventory:** "requested 20 · in stock 12" and a stepper bounded by `min(requested, assigned + stock)` and below by what's already on trips (from `lineProgress`), with a "Fill from stock" shortcut. **Non-inventory:** an Approve / Approved toggle |

The bounds in the UI are a convenience; the action is the guard and its refusal
message is shown as-is. When stock is short the line shows **"partial — 8 short"**
and Save still goes ahead: that's the partial-assign rule.

Closed requests render the card read-only, as the tools panel does.

---

## As built (2026-09-25)

Tasks 1–9 are built; `npm run typecheck` passes. No backend was added. Where
this differs from §1–§4:

- **`materials` is gone from `requestFormSchema`** and `deliveryMaterials` from
  the combined schema, as 5B said 5C would do. Both refines are now "a tool or
  a material line". The two delivery call sites pass `materials: ""` to
  `buildSummary`/`buildRequestPayload`, which already fall back to the lines'
  summary.
- **Extra shared files**, all within the size rules: `quantity-stepper.tsx`
  (the picker, the form's lines and the assign card share it),
  `material-stock-badge.tsx`, `material-other-item-form.tsx` (the picker's
  second tab), `material-name-field.tsx` + `material-item-fields.tsx` (the
  item form's parts, read through `useFormContext` so create and edit can both
  host them), `material-catalogue-card.tsx`, `materials-skeletons.tsx`,
  `request-card-materials.tsx` (the list card's box, extracted from the 20KB
  page), `lib/materials/line-inputs.ts` (pure edits on the form's line array)
  and `hooks/use-material-targets.ts` (the assign card's draft and bounds).
- **`/materials` reads with `includeInactive: true`** and the "show retired"
  toggle filters in the browser, like search and category — no round trip.
- **`app/(app)/materials/error.tsx`** is the error state for all three
  routes; the assign page's Materials card catches its own read failure and
  renders an alert instead of taking the tools panel down.
- **The "Other item" tab has no `<form>` element.** It sits inside a dialog
  inside the request form's React tree, and a submit would bubble through the
  portal to the request form. Enter adds the line by hand.
- **One inventory line per item** on a form: picking an item again changes its
  quantity (`setInventoryQty`).
- **Assign bounds count other lines of the same item** in the same draft, the
  way the action checks stock per item across the whole save.
- **Request page**: "short" shows once part of a line is assigned; a line with
  nothing assigned reads "Not assigned", and a non-inventory line "Approved" /
  "Awaiting approval". `NextAction` offers the assign link while any line is
  short, and says "Assign materials" on a materials-only `New` request.
- The request form's right-hand card is titled **Tools & materials**, since
  either satisfies it.
- `materials-field.tsx` and `material-dialog.tsx` stay: the pickup form and the
  combined pickup card still use them until 5G.

> **Re-plan 2026-09-28.** Three screens built here get later additions:
> - 5E adds a location column to `material-stock-history.tsx`, a "where it
>   is" card to `/materials/[itemId]` and a Warehouse / By site switch to
>   `/materials` ([5E §5](./phase-5e-delivery-frontend-trips.md#5-site-view-added-2026-09-28));
> - 5G adds transfer coverage and "From pickups" to the assign card
>   ([5G §2a](./phase-5g-pickup-frontend.md#2a-transfers-on-a-deliverys-assign-page-added-2026-09-28)).
>
> Nothing built here is wrong. It just isn't the last word.

## Tasks

- [x] 1. `/materials` list + `loading.tsx` + sidebar entry
- [x] 2. `/materials/new` and the shared item form
- [x] 3. `/materials/[itemId]`: edit, adjust stock, history
- [x] 4. `material-line-row.tsx`, `material-lines-field.tsx`,
      `material-picker-dialog.tsx`
- [x] 5. Wire into `request-form.tsx` and `requests/new/page.tsx`
- [x] 6. Wire into `combined-delivery-card.tsx` and `requests/new/combined/page.tsx`
- [x] 7. `request-materials-card.tsx` on the request page; list-card count
- [x] 8. `assign-materials-panel.tsx` + `assign-material-line.tsx` on the assign page
- [x] 9. `npm run typecheck` once, at the end

## Verification

UI is checked by the user in the browser, not by automated browser runs.
Suggested pass, on a test item and a test request:

1. `/materials` renders every item; retired ones only with the toggle; stock ≤ 0
   is red.
2. Create an item with opening stock; the history shows one `Receive`. Receive
   more, correct down; history and stock agree after each.
3. A delivery with one inventory and one other-item line submits; the request
   page lists both as "0 of n".
4. On the assign page, assign fewer than requested; the line reads partial and
   `/materials` stock dropped by exactly that much. Approve the non-inventory line.
5. A legacy request still shows its free text as the legacy note, and nothing
   else.
6. The combined page still creates its two requests, the delivery with its lines.
