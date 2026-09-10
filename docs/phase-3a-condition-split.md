# Phase 3A — split condition off `statusNew`

Read [`phase-3-pickup-lifecycle.md`](./phase-3-pickup-lifecycle.md) first — it
holds the schema and the decisions this slice implements.

## Scope

**In:** a new `tools.condition` field and `ToolCondition` option set; repointing
the `update-tool-status` helper at it; the pickup picker's selector becoming a
**condition** selector; the Tools dashboard showing both; `isAssignable`
reading condition.

**Out:** anything that reads or writes pickup *movement* — that is 3B onward.
No route is added and no lifecycle write changes in this slice.

## Why this goes first

3C writes `statusNew = "In Transit"` over whatever the PM picked. Building 3C
before this slice means knowingly shipping data loss and then reworking it.
3A is also the smallest slice and the only one verifiable entirely on screens
that already exist — the same reason `phase-2a-assignment.md` made its
`enums.ts` step standalone and checked it before moving on.

## Checklist

Update this as steps land, so a fresh chat can resume mid-slice.

> **Order is deliberate: Next.js first, Bubble after.** Everything below
> degrades to today's behaviour while `tools.condition` does not yet exist —
> Bubble omits unknown fields from a read, so `condition` parses as `undefined`
> and reads as `""`, and `isAssignable(condition, statusNew)` falls back to the
> `statusNew` check it does today. So the frontend can land and be reviewed
> before any live data moves. This mirrors how 2A shipped steps 5-6 against a
> schema that did not exist yet.

- [ ] **1. `enums.ts`** — `TOOL_CONDITION`, `ToolCondition`,
      `DEFAULT_TOOL_CONDITION`, `UNASSIGNABLE_CONDITION`, and the two-argument
      `isAssignable`
- [ ] **2. Read paths** — `condition` through `pickup-tools.ts`,
      `assigned-tools.ts` and both `-types.ts` modules
- [ ] **3. The codec** — `tool-status-updates.ts` becomes condition-shaped
- [ ] **4. The picker** — `pickup-tool-picker.tsx` + `pickup-request.ts` schema
- [ ] **5. The dashboard** — second badge, extracted into its own component
- [ ] **6. `check-bubble.ts`** — read `condition` on both `tools` paths
- [ ] **7. Bubble Studio** — option set, field, repoint `update-tool-status`
- [ ] **8. The backfill** — the one irreversible step; check counts first
- [ ] **9. Optional** — `toolshistory.prevCondition`/`newCondition`

---

## 1. Bubble Studio

### The option set and the field

1. New option set **`ToolCondition`** with exactly these display texts:
   `Ok`, `Maintenance Required`, `Repair Required`, `Under Repair`,
   `Inspection Required`, `Missing`.
2. New field **`tools.condition`**, typed `ToolCondition`.

The five overlapping names are intentional — they are the same words
`ToolStatusNew` uses, so the backfill is a copy rather than a translation, and
nothing in the UI changes vocabulary on the user. `Ok` is new (its
`ToolStatusNew` counterpart was `Available`, which is a *flow* state).

### Repoint `update-tool-status`

The private per-tool helper fanned out from `new-pickup-request`. Its single
*Make changes to a thing* step currently reads:

- **Thing to change:** `Search for tools (unique id = entry:split by "::":item #1):first item`
- **Field:** `statusNew` = `entry:split by "::":item #2 :converted to ToolStatusNew`

Change the field to **`condition`** and the `:converted to` target to
**`ToolCondition`**. Nothing else about the helper or the fan-out step moves.

> **Check the option-set type name in the Data tab before picking
> `:converted to`.** A conversion against the wrong set silently no-ops — the
> same trap `bubble-pickup-tool-status-workflow.md` §2 already warns about.

`bubble-pickup-tool-status-workflow.md` is the spec for this helper and is
**already stale** (it documents the original `status` field and a
`"Ready for Pickup"` default that the code no longer sends). Update it in this
slice rather than leaving a third generation of drift.

### The backfill — the one irreversible step

For `tools` rows whose `statusNew` holds one of the five condition values:
set `condition` to that value, then set `statusNew` to `Available`.

**Check the distribution in the Data tab first** and note the counts. This is
the only destructive step in all of phase 3. A row that was
`statusNew = "Repair Required"` is a tool nobody should be assigning; after the
backfill the *same* exclusion comes from `condition` instead, which is why
`isAssignable` is written to accept either during the transition.

> **Why `Available` and not blank.** `statusNew` is backfilled on every live
> row today, and every reader treats an empty `statusNew` as "the migration
> missed this row" rather than inventing a value. Blanking it here would
> manufacture exactly that signal on rows that are fine.

### Optional — `condition` history

`DB - Tools Change Log` (the pre-existing data-event workflow that fires on
`A tools is modified`) snapshots `prevStatus`/`newStatus` and
`prevStatusNew`/`newStatusNew`. It will **not** audit `condition` changes
unless `toolshistory` gains `prevCondition`/`newCondition` (option set
`ToolCondition`) and that workflow snapshots them too.

Worth doing — a tool marked `Missing` is precisely what you want a trail for —
but it is purely additive and can follow. **Do not** add an explicit history
step to any workflow in this app to compensate: that is what produced the
duplicate-row bug removed on 2026-09-10
(see [`bubble-update-request-status-spec.md`](./bubble-update-request-status-spec.md)).

---

## 2. Next.js

### `lib/bubble/enums.ts`

```ts
export const TOOL_CONDITION = [
  "Ok",
  "Maintenance Required",
  "Repair Required",
  "Under Repair",
  "Inspection Required",
  "Missing",
] as const
export type ToolCondition = (typeof TOOL_CONDITION)[number]

export const DEFAULT_TOOL_CONDITION: ToolCondition = "Ok"

/** Every `ToolCondition` except `Ok`. A tool in any of these is never offered. */
export const UNASSIGNABLE_CONDITION: readonly string[] = TOOL_CONDITION.filter((v) => v !== "Ok")

/**
 * False if *either* field reads unassignable, so the filter stays correct at
 * every point in 3A's backfill: before it, condition is empty and `statusNew`
 * still carries the five condition values; after it, the reverse.
 */
export function isAssignable(condition: string, statusNew: string): boolean {
  return !UNASSIGNABLE_CONDITION.includes(condition) && !UNASSIGNABLE_TOOL_STATUS.includes(statusNew)
}
```

Keep `TOOL_STATUS_NEW` and `UNASSIGNABLE_TOOL_STATUS` exactly as they are — the
first because the option set is unchanged, the second because it is half of the
transition-safe check above. Update `TOOL_STATUS_NEW`'s doc comment to record
that its five condition values are no longer written.

### The read paths

`condition` is `z.string().optional()` on the wire and `string` (defaulting to
`""`) in the domain type, matching exactly how `statusNew` is already handled.

| File | Change |
| --- | --- |
| `lib/bubble/pickup-tools.ts` | `condition` on the Zod row; `condition: row.condition ?? ""` in both `listToolsForJob` and `listAllTools` mappers |
| `lib/bubble/pickup-tools-types.ts` | `condition` on `PickupTool` and `DashboardTool` |
| `lib/bubble/assigned-tools.ts` | `condition` on `toolRow` and in `toCandidate()`; update the `isAssignable` call sites in `listCandidateTools` and `searchTools` to pass both fields. **`listToolsByIds` still filters nothing** — a tool already on a request must stay visible or it becomes un-unassignable |
| `lib/bubble/assigned-tools-types.ts` | `condition` on `CandidateTool` |

### The codec — `lib/bubble/tool-status-updates.ts`

Same `"<id>::<value>"` wire format, condition-shaped names:

```ts
export type ToolConditionUpdate = { toolId: string; condition: ToolCondition }

/**
 * The Bubble param is still named `toolStatusUpdates` — `new-pickup-request`'s
 * fan-out step reads it by that name and repointing the helper's *field* (3A)
 * didn't require renaming its *input*. Renaming the param is a Studio-side
 * change with no benefit here, so the mismatch is deliberate.
 */
export function formatToolConditionUpdates(updates: readonly ToolConditionUpdate[]): string[] {
  return updates.map((u) => `${u.toolId}::${u.condition}`)
}
```

### The picker — `components/pickup-tool-picker.tsx`

`PickupSelection.status`/`originalStatus` → `condition`/`originalCondition`;
`selectionOfTools` seeds both from `tool.condition`; `changedStatusLines` →
`changedConditionLines`, returning `ToolConditionUpdate[]`. The `Select` renders
`TOOL_CONDITION`.

**Keep the off-list-value prepend trick** exactly as it is:

```ts
const conditionOptions =
  selection && selection.condition && !(TOOL_CONDITION as readonly string[]).includes(selection.condition)
    ? [selection.condition, ...TOOL_CONDITION]
    : TOOL_CONDITION
```

That is what makes this migration order-independent — a live row holding a
value outside the set still renders, and still round-trips unchanged if the PM
doesn't touch it. `phase-2a-assignment.md` §4 called this out for the same
reason.

Two additions while in here:

- Label the field **Condition**, not Status.
- Surface the tool's `statusNew` as **read-only muted text** on every row. A PM
  can then see a tool is already `In Transit` or `Pickup Requested` and not
  request it twice — information the picker cannot currently show at all.

`lib/schemas/pickup-request.ts`: `toolStatusUpdates` → `toolConditionUpdates`,
`z.array(z.object({ toolId: z.string(), condition: z.enum(TOOL_CONDITION) }))`.
`lib/bubble/requests.ts#createPickupToolRequest` sends
`toolStatusUpdates: formatToolConditionUpdates(values.toolConditionUpdates)` —
the payload key stays, per the comment above.

### The dashboard — `components/tools-dashboard.tsx`

Render a second badge when `condition` is set and is not `Ok`. Flow status
keeps the existing `STATUS_BADGE_CLASSES` ramp; condition gets its own map
reusing `--status-attention` / `--status-repair` / `--destructive`.

> **The file is 307 lines against a 300-line ceiling.** Extract both badges
> into `components/tool-status-badges.tsx` rather than growing it —
> `CLAUDE.md`'s size rules are explicit that the split happens *before*
> finishing the change, not as a later cleanup. The new component is also
> reusable by `components/tool-row.tsx`, which renders the same badge today.

### `scripts/check-bubble.ts`

Read `condition` on both `tools` paths so `npm run check-bubble` proves the
field exists and parses before anything depends on it.

---

## Verification

1. `npm run typecheck`.
2. **Before the Bubble field exists:** the Tools dashboard and the pickup
   picker still render every live tool with a correct flow badge, no condition
   badge, and nothing falling through to default styling. That is what proves
   the read paths degrade cleanly.
3. **After the field and the repoint, before the backfill:**
   `npm run check-bubble` green. Change one deliberately-chosen tool's
   condition through the picker, submit a pickup request, then confirm in
   Bubble's Data tab that **`condition` moved and `statusNew` did not**. That
   single check is the whole slice.
4. **After the backfill:** spot-check a row that previously read
   `statusNew = "Repair Required"` now reads `statusNew = "Available"` +
   `condition = "Repair Required"`, and confirm it is still **excluded** from
   the assign screen's candidate list — `isAssignable` reading the new field.
5. Regressions: the delivery assign screen still offers and filters candidates;
   `/tools` grouping and its `localStorage` filter still work.

Every step from 3 onward is a real write to the live database.

## Known limits

- **`condition` has no audit trail** until the optional `toolshistory` fields
  are added.
- **`statusNew` keeps its five condition values.** They stop being written but
  remain in the option set, so a row edited by the old Bubble UI could still
  acquire one. `isAssignable` checking both fields is the permanent defence,
  not a transition measure.
- **`Ok` vs empty.** A row with no `condition` reads as assignable, same as a
  row reading `Ok`. Nothing distinguishes "inspected, fine" from "never
  inspected" — acceptable here, and the reason `DEFAULT_TOOL_CONDITION` exists
  for write paths that need to be explicit.
