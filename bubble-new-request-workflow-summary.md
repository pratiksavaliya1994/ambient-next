# Bubble Backend Workflow: `new-request` — Build Summary

**Branch:** `version-test` (treated as production; ~1,450 jobs / ~1,550 requests of real data)
**Built:** August 2026
**Status:** Workflow fully built in Bubble Studio. **Not yet tested end-to-end.**

This document summarizes what was built in Bubble Studio so the Next.js side
can be finished/updated against it. It supersedes the original build spec
(`bubble-create-request-workflow.md`) in a few places — see "Deviations from
original spec" below.

---

## ⚠️ Action required before anything else

1. **Endpoint name is `new-request`, not `create-request`.** The workflow
   was renamed mid-build. The Next.js app currently POSTs to
   `/wf/create-request` — **this must be updated to `/wf/new-request`** or
   every call will 404. Full URL pattern:
   `https://cfaner.bubbleapps.io/version-test/api/1.1/wf/new-request`
2. **Rotate the Azure AD client secret.** A live `client_id` /
   `client_secret` pair for the Microsoft Calendar integration was pasted
   into a screenshot during this build process. Treat it as compromised and
   rotate it in the Azure AD app registration.
3. **Authentication is set to "User & admin"**, not admin-only (deliberate
   choice — see below). Your existing admin bearer token still works
   unchanged; this setting just also permits calls from individual logged-in
   users in the future.

---

## Endpoint contract

```
POST https://cfaner.bubbleapps.io/version-test/api/1.1/wf/new-request
Authorization: Bearer {BUBBLE_API_TOKEN}
Content-Type: application/json
```

Response:
```json
{ "requestId": "<the new request's unique id>" }
```

## Parameters (22 total, all plain scalar types — no thing-type params)

| Parameter | Type |
|---|---|
| `job` | text |
| `jobId` | text — **Bubble's internal unique id** (`_id`), not the custom `id` field on jobs |
| `toDo` | text |
| `weAre` | text |
| `delivery` | yes/no |
| `pickup` | yes/no |
| `tentative` | yes/no |
| `floor` | text |
| `contact` | text |
| `contactPhone` | text |
| `fieldPm` | text |
| `notes` | text |
| `timeRange` | text |
| `requestDate` | date |
| `requestDateStart` | date |
| `requestDateEnd` | date |
| `color` | text |
| `order` | number |
| `searchable` | text |
| `toolsSummary` | text |
| `toolsNotes` | text |
| `summary` | text — full multi-line WhatsApp-ready message, real `\n` already in place |

`toDo` and `weAre` are declared as plain text and converted inside the
workflow via `: converted to toDo` / `: converted to weAre` (must exactly
match an option set display value — case-sensitive — or the conversion
silently fails to set the field).

---

## Workflow steps (final order)

**1. Create a new `request`**
Maps all 19 direct params (`job`, `toDo`—converted, `weAre`—converted,
`delivery`, `pickup`, `tentative`, `completed`=`no` fixed, `floor`,
`contact`, `contactPhone`, `fieldPM2`=`fieldPm` param **[name mismatch:
param is `fieldPm`, field is `fieldPM2`]**, `notes`, `timeRange`,
`requestDate`, `requestDateStart`, `requestDateEnd`, `color`, `order`,
`searchable`). The legacy `fieldPM` option-set field is left untouched/empty.

**2. Create a new `requestedtools`**
- `requestID` = Step 1's unique id (as text — plain text field, no real
  reference/link to `request`)
- `toolsSummary` / `toolsNotes` = params directly
- Gated: `Only when Result of step 1 is not empty` (defensive addition)

**3. Make changes to Jobs**
- Thing to change: `Search for jobs (unique id = jobId):first item`
- Sets `lastRequest` = Step 1's unique id (as text)
- If the search finds no job (bad `jobId`), this silently no-ops — Bubble
  does not error on an empty target, so steps 4+ still run. No `Only when`
  guard needed for this.

**4. Whapi Notifications — Send Text Notification**
- `to` = static, reused from wherever else in the app already sends to this
  WhatsApp group
- `body` = `summary` param, sent as-is

**5. Create a new Notifications**
- Stores a copy of the request/summary data (mirrors old app behavior)

**6. ClickUp API — Add New Request in CU**
Fires for **both delivery and pickup** requests (single action, not split).
- `toCUjobid` = Result of step 3 → **`id`** (the custom text field on jobs —
  this is the ClickUp list id, distinct from Bubble's unique id used in
  step 3's search)
- `toCUname` = Result of step 1 → `job`, **append arbitrary text**: ` - Delivery`
  (currently hardcoded to say "Delivery" even for pickup-only requests —
  flagged as a possible future fix, not yet changed)
- `toCUbody` = `summary` param directly → `: find and replace` (`"` → `in`)
- `toCUDate` = Result of step 1 → `requestDateStart` → `: extract UNIX`
- **Only when:**
  `(Result of step 3's name is not "Warehouse") AND (Result of step 3's name is not "Other - Not a Job Site") AND (Result of step 3's name is not "1407 Locker") AND (delivery is yes OR pickup is yes)`
  — the delivery/pickup pair must be entered as one nested "or" expression
  inside a single condition slot, not flattened, or the AND/OR precedence
  breaks. **Verified logic on paper; not yet tested live** — see Testing
  section.
- **Known edge case (not fixed):** if a request has both `delivery = yes`
  and `pickup = yes`, this fires once and creates one task — behavior for
  that combination hasn't been explicitly tested.

**7. Microsoft Calendar Events — Get Token**
Static body (grant_type, client_id, client_secret, scope) — copied as-is
from the old workflow.

**8. Microsoft Calendar Events — Add Event**
- `Authorization` header = `Bearer ` + Step 7 → `access_token`
- `subject` = confirmed working as configured (built from job name +
  `: formatted as text` on the delivery/pickup booleans — not fully
  re-verified in this conversation, but user confirmed it's correct)
- `startDateTime` / `endDateTime` = Step 1 → `requestDateStart` /
  `requestDateEnd`
- `body` = `summary : find & replace` (single find/replace — the old
  workflow had a **second** find/replace here whose purpose was never
  identified; may or may not matter for output quality)

**9. Return data from API**
- Key: `requestId`, Type: text, Value: Step 1's unique id
- Correctly positioned as the **last** action in the workflow.

---

## Deviations from original spec (`bubble-create-request-workflow.md`)

- Endpoint ended up named `new-request`, not `create-request` (see action
  item above).
- Authentication set to "User & admin" instead of "Admin only" — deliberate,
  to allow future user-triggered calls.
- Added a **Notifications** row creation (step 5) and **ClickUp** +
  **Microsoft Calendar** integrations (steps 6–8) — these weren't in the
  original spec doc but exist in the old page-workflow this replaces, and
  were added during this build to achieve full parity.
- `toCUbody` and calendar `body` reference the `summary` **parameter**
  directly rather than round-tripping through the Notifications record —
  functionally equivalent, one less hop.

## Open items / not yet resolved

- Whether the Microsoft Calendar event's `body` field is `contentType: Text`
  or `HTML` — affects whether `\n` line breaks render correctly. Unconfirmed.
- What the old workflow's **second** find-and-replace on the calendar body
  was doing (first is known: `"` → `in`).
- Whether `toCUname` should say "- Pickup" for pickup-only requests instead
  of always "- Delivery".
- Behavior when both `delivery` and `pickup` are `yes` on one request
  (currently untested for both ClickUp and Calendar steps).

## Testing — not yet done

No end-to-end test run has been performed yet. Before relying on this in
production:
1. Point the Next.js app at `/wf/new-request` (or test via Postman/curl
   directly against the endpoint with the admin bearer token first).
2. Submit one real test request with a real existing `jobId`.
3. Verify: `request` row created, `requestedtools` row linked, `jobs.lastRequest`
   updated, WhatsApp message received, ClickUp task created correctly, Outlook
   calendar event created with correct subject/times/body.
4. Check the response contains `requestId`.
5. Repeat with `pickup = yes, delivery = no` and with both `yes` to confirm
   the ClickUp/Calendar conditions behave as expected.
