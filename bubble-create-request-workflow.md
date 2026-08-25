# Bubble Studio setup: `create-request` backend workflow

## Background

A Next.js app (Tipp Floor Covering / Ambient Flooring tool request tool) is
moving its "create a request" flow from making two direct Bubble Data API
writes itself to calling **one Bubble backend (API) workflow** that does
everything server-side. The Next.js code side is already built and calls:

```
POST {BUBBLE_API_BASE}/wf/create-request
Authorization: Bearer {BUBBLE_API_TOKEN}   (the app's existing admin token)
Content-Type: application/json
```

with a JSON body of parameters (listed below), and expects back:

```json
{ "requestId": "<the new request's unique id>" }
```

(possibly nested under a `response` key — the calling code checks both, so
either shape works).

This workflow needs to be built in Bubble Studio to match that contract. It
replaces an older flow where the request row and its tool row were created by
two separate `POST /obj/...` Data API calls, and a WhatsApp message was sent
by a completely different mechanism (a page workflow triggered from Bubble's
own UI). **This new workflow is meant to fully replace both** — after it
exists, the only thing that creates a `request`/`requestedtools` row and sends
the WhatsApp message for requests coming through this app is this one
workflow, once per successful call.

## 0. Branch

Build this on whichever Bubble version/branch the app's `BUBBLE_API_BASE`
actually points at (check that env var/setting if unsure — for this project
specifically it is the `version-test` branch, which is treated as production;
~1,450 jobs and ~1,550 requests of real data live there). Building it on the
wrong branch means the calling app will get 404s.

## 1. Create the workflow

**Backend Workflows → New API Workflow.**

- Name it exactly `create-request` (the endpoint path is derived from this
  name — it becomes `/wf/create-request`, which is what the calling code
  already POSTs to).
- In the workflow's settings, set **"This workflow can be run: Admin only"**.
  This reuses the same admin API token the calling app already sends on every
  other Bubble call — no new secret to generate or hand back.

## 2. Declare parameters

Add these parameters, with these exact names and types (case-sensitive —
the calling code sends these keys verbatim):

| Parameter | Type |
|---|---|
| `job` | text |
| `toDo` | text (or the `toDo` option set type, if your app has one and it's selectable as a parameter type — either works, see step 3) |
| `weAre` | text (or the `weAre` option set type, same note) |
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
| `summary` | text |

Notes on a few of these, so the mapping in step 3 makes sense:

- `toDo` / `weAre` are option sets in the target `request` table. If you
  declare the parameter as plain `text`, Bubble will need converting to the
  option set inside the workflow (`this text : converted to toDo` in the
  expression editor) when you set the field in step 3. If your Bubble version
  lets you pick the option set itself as the parameter type, the incoming text
  is matched to the option set's display value automatically and no
  conversion step is needed — either is fine.
- `color`, `order`, `searchable`, `requestDate*` are pre-computed by the
  calling app (calendar colour, sort order, search string, New-York-timezone
  timestamps) — just store them as given, no computation needed on this side.
- `toolsSummary` is already formatted as the target app's
  `"Name: quantity", "Name: quantity"` text convention for its tools list —
  store it verbatim.
- `summary` is the complete, ready-to-send WhatsApp message text (multi-line,
  real `\n` characters already in place) — this workflow only needs to relay
  it to whatever WhatsApp-sending mechanism is configured (step 5), not build
  or reformat it.

## 3. Step 1 — Create a new `request`

Add a **Create a new thing** action, type `request`. Map fields to
parameters:

| `request` field | Value |
|---|---|
| `job` | `job` param |
| `toDo` | `toDo` param |
| `weAre` | `weAre` param |
| `delivery` | `delivery` param |
| `pickup` | `pickup` param |
| `tentative` | `tentative` param |
| `completed` | `no` (fixed — new requests always start incomplete) |
| `floor` | `floor` param |
| `contact` | `contact` param |
| `contactPhone` | `contactPhone` param |
| `fieldPM2` | `fieldPm` param — **note the field name mismatch**: the target table has both a legacy `fieldPM` option set (leave it empty — every recently-written row leaves it empty) and a `fieldPM2` text field (this is the one that actually gets read by the live app) |
| `notes` | `notes` param |
| `timeRange` | `timeRange` param |
| `requestDate` | `requestDate` param |
| `requestDateStart` | `requestDateStart` param |
| `requestDateEnd` | `requestDateEnd` param |
| `color` | `color` param |
| `order` | `order` param |
| `searchable` | `searchable` param |

## 4. Step 2 — Create a new `requestedtools`

Add a second **Create a new thing** action, type `requestedtools`:

| `requestedtools` field | Value |
|---|---|
| `requestID` | *Result of step 1*'s unique id, **as text** (this field is a plain text field holding the request's id as a string, not a linked-thing field — there is no referential integrity between the two tables in this schema, so it must be the id-as-text, not a "thing" reference) |
| `toolsSummary` | `toolsSummary` param |
| `toolsNotes` | `toolsNotes` param |

## 5. Step 3 — Send the WhatsApp message

Add whatever action sends to WhatsApp/Whapi in this Bubble app — most likely
an **API Connector** call (if one already exists for a similar purpose
elsewhere in the app, duplicate/reuse it here) hitting something like:

```
POST https://gate.whapi.cloud/messages/text
Authorization: Bearer <the Whapi token, stored in Bubble's own API Connector config or a private constant — not passed in from the calling app>
Content-Type: application/json

{ "typing_time": 6, "to": "<the target WhatsApp group id>", "body": <the `summary` parameter> }
```

The important part: the message **body** should be the `summary` parameter
value, sent as-is (it already has real newlines and full formatting — no
further text building needed on this side). Whatever WhatsApp group id and
Whapi token this app already uses elsewhere for similar messages should be
reused here.

This is the *only* place a WhatsApp message goes out for requests created
through the calling app, so nothing else should also be sending on `request`
creation for this path — if there's an old, separate mechanism (e.g. a page
workflow tied to a "create request" button in Bubble's own UI) that used to
send a similar message, it's a different trigger path and doesn't run for
requests created via this API workflow, so it's not a double-send concern
here.

## 6. Step 4 — Return data from API

Add a **Return data from API** action:

- Key: `requestId`
- Type: text
- Value: *Result of step 1*'s unique id

This is what the calling app reads back to confirm the request was created
and to show its id/confirmation in its own UI.

## 7. Test before relying on it

Before treating this as done:

1. Use Bubble's own "Run" / test feature on the workflow with sample parameter
   values, and check the server logs to confirm: a `request` row appears, a
   `requestedtools` row appears linked to it by id, a WhatsApp message
   actually arrives, and the returned data contains `requestId`.
2. Only after that, expect the calling Next.js app's "create request" form to
   work end-to-end — submitting it will now create a real row in the live
   database and send a real WhatsApp message, so treat every test submission
   from that point on as a real one, not a throwaway.
