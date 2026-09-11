# Bubble Studio setup: tool status/condition write-back for `new-pickup-request`

## Current live state (as of phase 3A)

The Pickup request form (`/requests/new/pickup` in the Next.js app) lets a PM
see each tool's current state (from Bubble's `tools` table) in the tool
picker and change it there. On submit it sends one extra parameter to the
existing `new-pickup-request` workflow:

```
toolStatusUpdates: ["<tools._id>::<new value>", "<tools._id>::<new value>", ...]
```

- **Only tools whose value was actually changed are included.** A tool that
  was checked but left at its default/fetched value sends nothing — this
  list can be empty on many submits.
- Each entry is one string, the tool's Bubble unique id and its new value
  joined by `::` — same "encode as one string" convention this app already
  uses for `toolsSummary` (`"Name: quantity"`), just keyed by id instead of
  name since this has to target one specific `tools` row.
- **The parameter name (`toolStatusUpdates`) has stayed fixed since this
  workflow was first built, even though what it writes has changed twice —
  see the history below.** Renaming it is a Studio-side change with no
  functional benefit, so the Next.js side (`lib/bubble/tool-status-updates.ts`)
  documents the mismatch rather than chasing it.

`new-pickup-request` fans this list out to a private helper, `update-tool-status`,
via a **Schedule API Workflow on a list** step — one call per changed tool,
scheduled rather than run inline so a slow or failed individual update never
blocks request creation. See "As currently built in Bubble" below for what that
helper does **today**, and "Phase 3A: what changes" for what to change it to.

### History

1. **Originally** (`bubble-create-request-workflow.md` era): the helper wrote
   the old `tools.status` field, and defaulted a checked tool to `"Ready for
   Pickup"`.
2. **Phase 2 repoint** (undocumented drift — this file was not updated at the
   time): the helper was repointed at `tools.statusNew` (the `ToolStatusNew`
   option set), matching the rest of the app's move off the old `status`
   field. The Next.js side has matched this since `lib/bubble/enums.ts`
   introduced `TOOL_STATUS_NEW`.
3. **Phase 3A** (this slice): `tools.statusNew` mixes *where a tool is in the
   flow* (`Available`, `In Transit`, …) with *what condition it's in*
   (`Repair Required`, `Missing`, …). Phase 3C will start writing
   `statusNew = "In Transit"` over whatever a PM picked here, which would
   silently discard the PM's condition pick. So condition splits off into its
   own field, `tools.condition`, and this helper is repointed at that instead.
   See `docs/phase-3a-condition-split.md` for the full design.

## As currently built in Bubble (before this slice's changes)

- **`new-pickup-request`** has a `toolStatusUpdates` parameter: text, **list**.
- **`update-tool-status`** (Admin-only backend workflow, one parameter `entry`
  — text) has one **Make changes to a thing** step:
  - **Thing to change:**
    `Search for tools (unique id = entry:split by "::":item #1):first item`
  - **Field to change:** `statusNew` =
    `entry:split by "::":item #2 :converted to ToolStatusNew`
- `new-pickup-request`'s fan-out step (**Schedule API Workflow on a list**,
  placed after the `requestedtools` create step) runs `update-tool-status`
  once per item of `toolStatusUpdates`, sending `This text` as `entry`, gated
  `Only when toolStatusUpdates is not empty`.

## Phase 3A: what changes

**No new workflow. No new parameter.** Only `update-tool-status`'s one step
changes, plus one new option set and field it depends on.

### 1. New option set and field

1. New option set **`ToolCondition`** with exactly these display texts:
   `Ok`, `Maintenance Required`, `Repair Required`, `Under Repair`,
   `Inspection Required`, `Missing`.
2. New field **`tools.condition`**, typed `ToolCondition`.

The five overlapping names with `ToolStatusNew` are intentional — the
backfill (step 3) is a copy, not a translation. `Ok` is new; `ToolStatusNew`'s
counterpart (`Available`) is a flow state, not a condition.

### 2. Repoint `update-tool-status`'s one step

Change the existing **Make changes to a thing** step's field from:

- `statusNew` = `entry:split by "::":item #2 :converted to ToolStatusNew`

to:

- `condition` = `entry:split by "::":item #2 :converted to ToolCondition`

Nothing else about the helper, its parameter, or `new-pickup-request`'s
fan-out step changes.

> **Check the option-set type name in the Data tab before picking
> `:converted to`.** A conversion against the wrong set silently no-ops.

### 3. The backfill — the one irreversible step in this slice

For every `tools` row whose `statusNew` currently holds one of the five
condition values (`Maintenance Required`, `Repair Required`, `Under Repair`,
`Inspection Required`, `Missing`):

1. Set `condition` to that same value.
2. Set `statusNew` to `Available`.

**Check the distribution in the Data tab first** and note the counts before
running it. Do this only after step 2 is live and tested — otherwise a
PM's next pickup submit could write to `condition` on a row this backfill
hasn't touched yet, which is harmless (it's the same field either way) but
makes the before/after counts harder to reason about.

> **Why `Available` and not blank.** Every live row's `statusNew` is already
> backfilled from the old `status` field; every reader treats an empty
> `statusNew` as "the migration missed this row." Blanking it here would
> manufacture that signal on rows that are fine.

### 4. Optional — condition history

`DB - Tools Change Log` (the pre-existing data-event workflow on `A tools is
modified`) snapshots `prevStatus`/`newStatus` and `prevStatusNew`/`newStatusNew`.
It will **not** audit `condition` changes unless `toolshistory` gains
`prevCondition`/`newCondition` (option set `ToolCondition`) and that workflow
is extended to snapshot them too. Purely additive, can follow later. **Do
not** add a separate explicit history-writing step to any workflow to
compensate — that duplicate-row pattern was removed 2026-09-10 (see
`docs/bubble-update-request-status-spec.md`).

## Test before relying on it

1. In Bubble Studio, **Run** `update-tool-status` directly with a sample
   `entry` (`"<a real tools row's unique id>::Repair Required"`). Confirm in
   the Data tab that row's `condition` changed and its `statusNew` did
   **not**.
2. Re-run `new-pickup-request` (Studio's test feature) with a non-empty
   `toolStatusUpdates` list. Confirm `update-tool-status` fires once per
   item and each target row's `condition` (not `statusNew`) changed.
3. Re-run with `toolStatusUpdates` empty and confirm nothing is scheduled —
   the common case, since most picked-up tools won't have their condition
   edited.
4. End-to-end from the Next.js form: create a pickup, check a tool, change
   its condition in the picker (now labeled Condition, with the tool's
   `statusNew` shown alongside as read-only text), submit, and confirm in
   Bubble's Data tab that `condition` moved and `statusNew` did not. This is
   `docs/phase-3a-condition-split.md`'s whole verification in one check.
5. Only after all of the above, run the backfill (step 3), then spot-check a
   previously-`statusNew = "Repair Required"` row now reads
   `statusNew = "Available"` + `condition = "Repair Required"` and is still
   excluded from the assign screen's candidate list.
