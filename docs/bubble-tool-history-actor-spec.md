# Bubble build sheet: who changed a tool (`lastEditedBy` → `doneBy`)

Step-by-step Bubble Studio changes that make the tool History timeline show the
person who made a change instead of "by System". The Next.js half is **already
built**; this sheet is only the Bubble half.

---

## 0. Background (read once)

- Every call from the Next.js app reaches Bubble under **one admin API token**.
  So on every `toolshistory` row, the built-in `Created By` is the token's own
  user, which the app shows as "System". `Created By` can't be overridden.
- `toolshistory` rows are written by the data-trigger workflow **`DB - Tools
  Change Log`** (event: *A tools is modified*). That trigger can only see the
  `tools` row **before** and **now**. It never sees the API call or its
  parameters.
- So the person's name has to be written **onto the `tools` row itself**, in
  the same write that changes it. The change log then copies it across.
- The signed-in person is not a Bubble `user` (there's no email field to match
  on), so the name travels as **plain text**, e.g. `"Pratik Savaliya"`.

**What the Next.js app now sends (already live in code):**

| Writer | What it sends |
| --- | --- |
| Data API `PATCH /obj/tools/{id}` (tool edit page, photos) | `lastEditedBy: "<name>"` alongside the changed fields |
| Data API `POST /obj/tools` (new tool page) | `lastEditedBy: "<name>"` on the new row |
| **Every** `POST /wf/<any workflow>` | an extra top-level key `actor: "<name>"` |

**The one rule everything below follows:**

> Every step, in any workflow, that changes a `tools` row must either
> **set `lastEditedBy = actor`** or **clear `lastEditedBy`**. A step that
> skips it leaves the *previous* person's name on the row, and the next
> history row credits them with a change they didn't make.

---

## 1. Data: add two fields (do this first)

> ⚠️ **Do this before anyone uses the new app build.** The app's Data API
> writes now include `lastEditedBy`. Until that field exists on `tools`, Bubble
> will most likely reject those writes, so the tool edit, photo and create pages
> would fail to save.

### 1.1 `tools.lastEditedBy`

1. **Data** tab → **Data types** → `tools`.
2. **Create a new field**:
   - Field name: `lastEditedBy` (exact spelling and case)
   - Field type: **text**
   - Is a list: **no**
3. Save.

### 1.2 `toolshistory.doneBy`

1. **Data** tab → **Data types** → `toolshistory`.
2. **Create a new field**:
   - Field name: `doneBy` (exact spelling and case)
   - Field type: **text**
   - Is a list: **no**
3. Save.

### 1.3 Check

- **Settings → API → Data API**: `tools` and `toolshistory` are both already
  exposed (the app reads and writes them today). No change is needed.
- **Data → Privacy**: no change is needed. The app uses the admin token,
  which bypasses privacy rules.

---

## 2. `DB - Tools Change Log`: copy the name into history

**Backend workflows** → the **Database trigger events** folder (or wherever it
lives) → `DB - Tools Change Log` (event *A tools is modified*).

1. Open its existing **Create a new toolshistory** step.
2. Click **Set another field** → `doneBy` = **`tools now's lastEditedBy`**
   (Bubble may call it "Tools Now"; use the *now* side, **not** *before change*).
3. Don't change any other field, don't add a condition, and don't add any
   other step.

That's the whole change here. From this point on, any write that stamps
`lastEditedBy` produces a history row with `doneBy` filled in. Rows where it
stays empty still show "System", exactly as today.

---

## 3. Backend (API) workflows: accept `actor`, stamp it on `tools`

Every workflow below gets **one new parameter**, and every step that changes
`tools` gets **one new field**.

**The parameter (same on every workflow in this section):**

| Setting | Value |
| --- | --- |
| Key | `actor` |
| Type | **text** |
| Is a list | **no** |
| Optional | **yes, tick it** (so an older call without it doesn't error) |

**The field (same on every tools step in this section):**
`lastEditedBy` = **`actor`**. Add **no "only when" condition** on it. If
`actor` is ever empty, writing empty is the correct result (see the rule in §0).

Don't touch any other step, parameter, condition or return value.

### 3.1 `update-request-status`

Used by: assign, release to Available, dispatch, offload, and confirm pickup.

1. Add parameter `actor` (table above).
2. **Step 3** (*Make changes to a list of things*, list =
   `Search for tools (unique id is in toolIds)`): **Set another field** →
   `lastEditedBy` = `actor`.
   - The existing *only when* conditions on `statusNew` / `location` /
     `currentUser` stay exactly as they are.
   - The step's own gate (`toolIds is not empty`) stays.
3. Steps 1, 2 and 4 (request status, driver, return) are **not** changed. They
   don't write `tools`.

### 3.2 `new-pickup-request` and its helper `update-tool-status`

This one has **two** tools writes, one of them in a private helper.

**A. The helper `update-tool-status`** (private, fanned out once per tool,
writes `condition`):

1. Add parameter `actor` (table above).
2. Its single *Make changes to a thing* step (thing =
   `Search for tools (unique id = entry:split by "::":item #1):first item`):
   **Set another field** → `lastEditedBy` = `actor`.

**B. `new-pickup-request` itself:**

1. Add parameter `actor` (table above).
2. The **Schedule API Workflow on a list** step that calls
   `update-tool-status`: a new `actor` row appears in its parameter list →
   set it to **`actor`** (this workflow's own parameter). *If the helper's new
   parameter doesn't appear, refresh the editor.*
3. The **Make changes to a list of things** step
   (`Search for tools (unique id is in toolIds)`,
   `statusNew = "Pickup Requested"`): **Set another field** →
   `lastEditedBy` = `actor`.
4. The **Schedule API Workflow on a list** → `assign-request-tool` step: **no
   change**. That helper only creates `assignedtools` rows and never writes
   `tools`.

### 3.3 `start-trip`

1. Add parameter `actor` (table above).
2. **Step 3** (*Make changes to a list of things*,
   `Search for tools (unique id is in toolIds)`: `statusNew = "In Transit"`,
   `location = driver`, `currentUser = driver`): **Set another field** →
   `lastEditedBy` = `actor`.
3. Every other step (trip row, `triptool` states, any `tripmaterial` steps
   from phase 5D) is **not** changed.

> Note: `actor` is the person clicking in the app, and `driver` is the trip's
> driver. They're often the same person but not always, so keep them
> separate. Don't reuse `driver` for `lastEditedBy`.

### 3.4 `complete-trip-stop`

1. Add parameter `actor` (table above).
2. Add `lastEditedBy` = `actor` to **each of these four `tools` steps**:

| Step | List | What it already sets |
| --- | --- | --- |
| 2 | `tools` where `unique id is in dropToolIds` | `statusNew = dropStatus`, `location = dropLocation` |
| 4 | `tools` where `unique id is in loadToolIds` | `statusNew = "In Transit"`, `location = driver`, `currentUser = driver` |
| 6 | `tools` where `unique id is in skipToolIds` | `statusNew = "Pickup Requested"` only |
| 8 | `tools` where `unique id is in returnToolIds` | `statusNew = dropStatus`, `location = dropLocation` |

3. **Do not add a `tools` step for `refuseToolIds`** (step 10). That step
   deliberately writes nothing to `tools`, and that must stay true.
4. The `triptool` steps (3, 5, 7, 9, 10), the material steps and the return
   are **not** changed.

### 3.5 Workflows that need **no change**

These don't write `tools`, so they can ignore `actor` (Bubble drops a body key
that isn't a declared parameter):

`new-request`, `create-assigned-tool`, `assign-request-tool`, `create-trip`,
`save-trip`, `complete-trip`, `cancel-trip`, `mark-trip-stop-done`,
`set-request-order`, `adjust-material-stock`, `assign-request-materials`,
`adjust-site-stock`, and the trip stop/tool/material create helpers.

**If any of these does turn out to have a *Make changes* step on `tools`**
(see §5.1), treat it like §3: add `actor`, stamp `lastEditedBy = actor`.

---

## 4. Legacy workflows: clear the field

`/wf/Set Status` and `/wf/Set Location` are the old Bubble UI's writers. They
don't know who's calling, so they **clear** the name instead of leaving the
last app user's name on the row.

For **each** of `Set Status` and `Set Location`:

1. Open its *Make changes to a thing* step on `tools`.
2. **Set another field** → `lastEditedBy` = *(leave the value empty)*.
3. Don't add a parameter or change anything else.

Their history rows then show "System", or the old Bubble UI user's name via
`Created By` if the call came from a logged-in Bubble user. That's the
correct result.

---

## 5. Final sweep and tests

### 5.1 Make sure no `tools` writer was missed

In the Bubble editor, open the **search tool** (magnifier icon, top left of the
Workflow tab, "App search tool"):

1. Search **Actions** of type **Make changes to a thing** → check every result
   whose *thing* is a `tools`.
2. Search **Actions** of type **Make changes to a list of things** → check
   every result whose list is `tools`.
3. Also search for **Copy a list of things** / **Create a new thing** on
   `tools`, if any exist.

Every hit must be one of: §3 (stamps `actor`), §4 (clears), or a page
workflow in the old UI (add *clear* the same way as §4). **No hit may leave
`lastEditedBy` untouched.**

### 5.2 Tests (each one is a real write, so pick a test tool and put it back)

Check each by opening the tool's page in the app (`/tools/<id>`) → **History**
card, or in **Data → App data → toolshistory**, sorted by Created Date,
newest first.

| # | Do this in the app | Expect on the newest history row |
| --- | --- | --- |
| 1 | Tool page → change **location** → Save | `doneBy` = your name; the timeline says "by <your name>" |
| 2 | Tool page → add a **photo** | `tools.lastEditedBy` = your name (the history row is hidden from the timeline, which is fine) |
| 3 | **New tool** page → create one | `tools.lastEditedBy` = your name on the new row |
| 4 | Assign a tool to a request | The Available → Assigned row shows your name (§3.1) |
| 5 | Create a pickup request with a tool whose condition you change | Both rows (Pickup Requested, and the condition change) show your name (§3.2 A + B) |
| 6 | Start a trip | The Assigned → In Transit row shows your name (§3.3) |
| 7 | Complete a stop (drop and/or collect) | The In Transit → Delivered row shows your name (§3.4) |
| 8 | Look at any row from before today | Still "by System" (older rows are unchanged, as expected) |

If a row in tests 4–7 still says "System": that workflow's *tools* step is
missing `lastEditedBy = actor`, or the `actor` parameter wasn't added or was
misspelled. Check the Bubble **Logs → Server logs** for that workflow run to
see whether `actor` arrived.

---

## 6. Rollback

Everything here is additive. To undo it, remove the `doneBy` field from
the change log's Create step. History goes back to showing "System", and the
extra fields and parameters are harmless if left in place.
