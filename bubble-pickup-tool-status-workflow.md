# Bubble Studio setup: tool status write-back for `new-pickup-request`

## Background

The Pickup request form (`/requests/new/pickup` in the Next.js app) now lets
a PM see each tool's current `status` (from Bubble's `tools` table) in the
tool picker popup and change it there — e.g. checking a tool defaults it to
`"Ready for Pickup"`, and the PM can pick a different value (`"To be
Repaired"`, `"Missing"`, etc.) if something's wrong with it.

The Next.js side is already built and, on submit, now sends one extra
parameter to the existing `new-pickup-request` workflow:

```
toolStatusUpdates: ["<tools._id>::<new status>", "<tools._id>::<new status>", ...]
```

- **Only tools whose status was actually changed are included.** A tool that
  was checked but left at its default/fetched status sends nothing — this
  list can be empty on many submits.
- Each entry is one string, the tool's Bubble unique id and its new status
  joined by `::` — same "encode as one string" convention this app already
  uses for `toolsSummary` (`"Name: quantity"`), just keyed by id instead of
  name since this has to target one specific `tools` row to write to.

This document is an **addendum** to `new-pickup-request` (already built per
`bubble-new-request-workflow-summary.md`) — it does not rebuild that
workflow, it adds one parameter and one new step to it, plus one small new
helper workflow.

## 1. Add the parameter to `new-pickup-request`

Open the existing `new-pickup-request` backend workflow → its parameters.

Add:

| Parameter          | Type            | Notes                                                                 |
| ------------------- | --------------- | ---------------------------------------------------------------------- |
| `toolStatusUpdates` | text **list**   | In the parameter type dropdown, pick `text` and check the "list" / "This input is a list" option. Each list item is one `"<toolId>::<status>"` string. |

## 2. Create the small helper workflow, `update-tool-status`

**Backend Workflows → New API Workflow.**

- Name it exactly `update-tool-status`.
- Same **"This workflow can be run: Admin only"** (or whatever
  `new-pickup-request` itself is set to) — it's only ever triggered from
  inside another backend workflow, never called directly by the Next.js app.
- Add one parameter:

  | Parameter | Type |
  | --------- | ---- |
  | `entry`   | text |

  This receives one `"<toolId>::<status>"` string at a time — see step 3.

### Step 1 — update the matching `tools` row

Add a **Make changes to a thing** action:

- **Thing to change**:
  `Search for tools (unique id = entry:split by "::":item #1):first item`
  — split the `entry` param on `::` and take the first piece (the tool's
  unique id), then search `tools` for the row with that id.
- **Field to change**: `status` =
  `entry:split by "::":item #2 : converted to <the option set type backing tools.status>`
  — the second piece of the split is the new status text; convert it to the
  option set the same way `new-request` already converts `toDo`/`weAre` text
  params to their option sets. **Check the exact option set type name in the
  Data tab** (it may not be literally called `status` — it's whatever option
  set type the `tools.status` field is declared against) before picking the
  `: converted to …` operator, or the conversion will silently no-op.

No other steps needed — this workflow's only job is the one field update.
It doesn't need a **Return data from API** action since nothing reads its
response (see step 3, `Ignore errors` note).

## 3. Add the fan-out step to `new-pickup-request`

Back in `new-pickup-request`, add a **Schedule API Workflow on a list**
action. Where you insert it doesn't affect correctness (it doesn't depend on
or block anything downstream), but for readability put it right after the
existing **Step 2 — Create a new `requestedtools`** action, since both deal
with the tool data from this submission.

- **Type of things to run this workflow on**: `text` (a list of texts)
- **List to run it on**: `toolStatusUpdates` param
- **Workflow to run**: `update-tool-status`
- **Value to send for `entry`**: `This text` (Bubble's placeholder for "the
  current item of the list being iterated")
- **Only when**: `toolStatusUpdates is not empty` — defensive, same gating
  pattern the existing `requestedtools` step already uses (`Only when Result
  of step 1 is not empty`). With this guard, a pickup where no tool's status
  changed schedules nothing.

This step **schedules** the per-tool updates rather than running them
inline — `new-pickup-request` doesn't wait for them to finish before moving
on to its later steps (ClickUp, Calendar, `Return data from API`), so a slow
or failed individual `tools` update never blocks or fails the request
creation itself.

## 4. Test before relying on it

1. In Bubble Studio, use **Run** / the test feature on `new-pickup-request`
   with sample parameters, including a non-empty `toolStatusUpdates` list
   using a real `tools` row's unique id (copy one from the `tools` data
   tab). Check the server logs: the `update-tool-status` workflow should
   fire once per list item.
2. Open that `tools` row in the Data tab afterward and confirm its `status`
   changed to the value you sent — and that it's the **only** row that
   changed (other tools at the same job/location should be untouched).
3. Re-run with `toolStatusUpdates` empty (or omitted) and confirm no
   `update-tool-status` runs are scheduled and nothing else about the
   workflow's behavior changes — this is the common case, since most
   picked-up tools won't have their status edited.
4. Only after both cases check out, test end-to-end from the Next.js form:
   create a pickup, check a tool, change its status in the picker, submit,
   and verify the same thing in Bubble's Data tab. Treat this as a real
   write to the live `version-test` app, not a throwaway — it's the same
   database the rest of this app runs against.
