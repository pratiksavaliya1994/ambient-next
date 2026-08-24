# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The actual project lives in `next-ambient/` — treat it as the working root for all commands below (the outer `Ambient/` folder is not a git repo and has no project files of its own).

---

# Tool Workflow — Next.js frontend on Bubble backend

## What this project is

A Next.js frontend for the Tipp Floor Covering / Ambient Flooring tool
workflow. Bubble.io stays as the database and backend. Next.js replaces the UI.

**Current scope:** the request creation flow. A PM picks a job, a job type,
a date and slot, and a set of tool *types with quantities*; submitting writes
one `request` row and one `requestedtools` row. A list page reads requests back
with their tool types and counts.

**Deliberately not built yet:** assigning specific tools to a request,
approving or rejecting, materials, QR scanning, GPS.

---

## The one thing to know before changing anything

**The Bubble app this points at is live and its schema is fixed.**

`https://cfaner.bubbleapps.io/version-test/api/1.1` is nominally the
development branch, but it is the only version in use — treat it as
production. It holds ~1,450 jobs and ~1,550 requests of real data.

- Do not add, rename, retype or delete a Bubble field.
- Do not write to it while exploring. Reads are free; every write is a real row.
- If something seems to need a new field, the answer is to work with what is
  there, or to ask.

An earlier version of this document described a different schema — `Role`,
`passwordHash`, `ApprovalStatus`, `requestedByUser`, `Locations`, one
`requestedTools` row per unit. **None of that exists.** What follows was read
off the live Swagger document and verified against 200 recent `request` rows,
all 112 `toolstype` rows, all 1,445 `jobs`, and 100 `requestedtools` rows.

---

## Architecture

```
Browser
  └─ Next.js (App Router)
       ├─ Auth.js v5 — JWT sessions, no database
       │    ├─ dev-login  (temporary, no password — see Auth)
       │    └─ Entra ID   (the real one, off until creds exist)
       └─ server-only Bubble client ──>  Bubble Data API
                                           (API token, server-side only)
```

**There is no application database.** Bubble is the only datastore. Auth.js
runs in JWT mode so no session table is needed. Do not introduce Postgres,
Prisma, Drizzle, or any ORM.

Two rules that follow:

1. **The Bubble API token never reaches the browser.** All Bubble calls go
   through server components or server actions. No `NEXT_PUBLIC_` variable
   holds a token or a base URL used for writes.

2. **Bubble is the source of truth for schema.** Do not invent fields. Read
   `meta/swagger.json` rather than guessing.

---

## Auth

Auth.js v5, `session: { strategy: 'jwt' }`, no adapter, no database.

### Two providers, both behind flags

| Flag | Provider | Status |
| --- | --- | --- |
| `ALLOW_DEV_LOGIN` | `dev-login` (Credentials) | **On.** Temporary. |
| `ALLOW_ENTRA` | Microsoft Entra ID | Off until the credentials exist. |

**`dev-login` checks nothing.** Type a name, get a session. It exists only
because the Entra credentials are not in hand yet. Anyone who can reach the
login page can sign in as anyone, and this app writes to the live Bubble
database — so it is safe on localhost and nowhere else. The signed-in shell
shows a red banner whenever it is active, so it cannot be left on unnoticed.

Switching to Entra is `ALLOW_ENTRA=true`, `ALLOW_DEV_LOGIN=false`, then delete
the provider from `auth.ts`, `lib/schemas/auth.ts`, `signInAsDevUser`, and the
banner. Nothing else changes: the two providers resolve to the same session
shape, and **nothing downstream may branch on which one was used.**

### The session is not a Bubble user

The live `user` type has **no `email`, `Role` or `passwordHash` field**. Its
only fields are `displayName`, `id`, `tempConsumable`, `tempNotification`,
`tempTools`, plus Bubble's system fields. The address lives inside an opaque
`authentication` object that the Data API cannot be constrained on.

So there is nothing to look a signed-in person up by, and no attempt is made.
Three consequences:

- **The session identifies the person to the UI only.** `session.user.name` /
  `.email` are used for the WhatsApp summary's "New request from …" line and
  the header. Nothing else.
- **`Created By` on every row is the API token's owner**, not the submitter.
  Never use `Created By` in a constraint written from Next.js.
- **There are no roles.** Every signed-in user reaches every screen.
  `lib/auth/session.ts` is authentication only — `requireSession()`, no
  `requireRole()`.

Who a request belongs to is whatever `fieldPM2` says, and nothing else.

The Entra credentials are the same ones the Bubble app's API Connector uses
("New Login" entry). `/api/auth/callback/microsoft-entra-id` must be a
registered redirect URI on that app registration for both localhost and
production, or sign-in fails with AADSTS50011 after the password prompt.

There is no password-based provider and there will not be: the `passwordHash`
field the old design leaned on does not exist in this schema, and there is
nowhere to put one.

`proxy.ts` redirects unauthenticated visitors for UX only. It is **not** a
security boundary (CVE-2025-29927): every server action calls
`requireSession()` itself, because server actions are reachable by direct POST.

---

## Bubble Data API

Base: `https://cfaner.bubbleapps.io/version-test/api/1.1`
Header: `Authorization: Bearer ${BUBBLE_API_TOKEN}`

`npm run check-bubble` is a read-only smoke test that exercises every read path
and prints what came back. Run it first when anything looks wrong.

### Reading

```
GET /obj/{type}?constraints=[...]&limit=100&cursor=0&sort_field=Created%20Date&descending=true
```

Response: `{ "response": { results, cursor, count, remaining } }`

`limit` maxes at 100 — always paginate on `remaining > 0`. Useful
`constraint_type` values: `equals`, `not equal`, `is_empty`, `is_not_empty`,
`greater than`, `less than`, `in`, `not in`, `text contains`. `in` takes an
array and is how tool lines are fetched for a page of requests in one call.

### Writing

- `POST /obj/{type}` — create, returns `{ id }`
- `PATCH /obj/{type}/{id}` — partial update
- `DELETE /obj/{type}/{id}` — delete

No bulk write endpoint, and no transactions.

### Type mapping

| Bubble type | API representation |
| --- | --- |
| linked thing | the `_id` string |
| option set | the **display text**, e.g. `"Grind & Epoxy"` |
| date | ISO 8601 string |
| yes/no | boolean |
| list | array |

Swagger marks option-set fields as `"option set"` but **does not expose their
values**. The values in `lib/bubble/enums.ts` were read off live rows instead.
An option-set write with an unrecognised value fails silently in Bubble.

### Backend workflows

Three exist and must not be broken: `/wf/googleDataToDB`, `/wf/Set Location`,
`/wf/Set Status`. Nothing in this app calls them; everything is Data API CRUD.

---

## Data model — as it actually is

### `request`

The header row. 24 business fields; the ones this app writes:

| Field | Type | Notes |
| --- | --- | --- |
| `job` | text | The job **name**, e.g. `"107 Greenwich St - J24-0407"`. Not a link to `jobs`. |
| `toDo` | option set | Job type. Also filters the tool catalogue — see `toolstype.realtedTo`. |
| `weAre` | option set | `Ambient` / `Tipp` / `BT Flooring` / `Pyramid Floors` |
| `delivery`, `pickup` | yes/no | Both can be true. |
| `requestDate` | date | **Midnight New York** on the delivery day. Not the submission time. |
| `requestDateStart` / `End` | date | The calendar slot, one hour apart. |
| `timeRange` | text | Free text, and genuinely free: live values include `Anytime`, `6-8am`, `TBD`, `Joes truck today`. |
| `floor` | text | `14`, `ground`, `loading dock`, `Suite 139`. |
| `contact`, `contactPhone` | text | |
| `fieldPM2` | text | The PM's name. **This is the one that gets written.** |
| `fieldPM` | option set | Legacy. Empty on all 200 recent rows. Not written. |
| `notes` | text | |
| `tentative`, `completed` | yes/no | |
| `color` | text | Calendar event colour: `#2299ff` when delivery, `#ff7744` for pickup-only. |
| `order` | number | Always `100` on every live row. |
| `searchable` | text | What the Bubble search box matches: `` `${jobs.description} - ${M-D-YYYY h:mm am ET}` ``. |

Not written by this app: `pictures`, `onClickUp`, `realGC`, `Slug`.

### `requestedtools`

**One row per request, not per tool and not per unit.** Three business fields:

| Field | Type | Notes |
| --- | --- | --- |
| `requestID` | text | The request `_id`. Not a link — no referential integrity. |
| `toolsSummary` | text | The entire tool list, as one string. |
| `toolsNotes` | text | Free text. |

`toolsSummary` format, from live rows:

```
"Large Garbage Pails For Water: 1", "Pump Jack Electric: 1", "Spiked Shoes: 2"
```

Quoted `Name: quantity` entries, comma-separated. The name is the **only**
identifier — there is no link to `toolstype`.

**Parse by splitting on the last colon, not the first.** Live rows contain
names with colons in them: `"Concrete Mixer: The green one: 2"` is one tool
called `Concrete Mixer: The green one`, quantity 2. Both directions of this
codec live in `lib/bubble/tools-summary.ts` so they cannot drift.

### `toolstype`

The catalogue, 112 rows.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | text | The identifier, as far as `toolsSummary` is concerned. |
| `realtedTo` | list of option set | **The misspelling is Bubble's — keep it.** Which job types the tool is offered for. |
| `consumable` | yes/no | |
| `notes` | text | |
| `quantity`, `order`, `clickUpID` | | Mostly empty. |

`realtedTo` holds `toDo` values, which is what filters the picker. `Fast
Request` appears in no tool's list, so it means "show everything".

### `jobs`

1,445 rows. `name` is what `request.job` stores; `description` is the longer
`name + details` string that feeds `request.searchable`. Also `gc`, `borough`,
`details`, `status` (a mix of numbers and words — not a usable filter).

### `pms`

12 rows. `Name` and `Company` are option sets, returned as display text.
`Active` is set on exactly one row, so it is **not** used as a filter — PMs who
appear on recent requests do not have it set.

### `timelabels`

The 14 half-hour slots the Bubble calendar lays requests out on
(`06:00 a.m. to 06:30 a.m.` … `07:00 p.m. to 07:30 p.m.`). They set
`requestDateStart` / `End`. Separate from the free-text `timeRange`.

### Types this app does not touch

`tools`, `toolshistory`, `consumables`, `materials`, `materialsfromebom`,
`requestedmaterials`, `notifications` (except when notifications are enabled).

---

## The flow that is built

### Creating a request

**Nothing is written to Bubble until submit.** Tool selection lives entirely in
client state — no draft rows, no session key. Abandoning the form leaves the
database untouched.

This is worth preserving: the old Bubble UI does the opposite, staging the
selection in `user.tempTools` (an array of `"Name: qty"` strings), and
abandoned entries are never cleaned up.

1. `app/(app)/requests/new/page.tsx` loads jobs, tool types, PMs and time slots
   server-side and passes them in.
2. `components/request-form.tsx` holds every field in `useState` and submits
   the whole thing as one JSON string in a hidden `payload` field. JSON rather
   than loose `FormData` entries because the tool selection is an array of
   objects, and this way the same Zod schema validates it in the browser and
   again on the server.
3. `app/(app)/requests/actions.ts` re-validates, then:
   - `POST /obj/request`
   - `POST /obj/requestedtools` with `requestID` and the formatted summary
   - composes the WhatsApp summary and sends it *if enabled*
   - `revalidatePath('/requests')`

**Partial failure is real.** There are no transactions. The `request` row is
written first; if the `requestedtools` write then fails, the request exists
without its tools. The action returns a warning saying exactly that rather than
reporting a clean success. Do not "fix" this by swallowing it.

### Reading requests back

`listRecentRequests` is two queries, not one per request: a page of requests
sorted by `Created Date`, then all their tool rows in one `in` lookup on
`requestID`. A request can carry more than one `requestedtools` row (the Bubble
UI writes a fresh one per submit), so lines are merged and quantities summed.

---

## WhatsApp notifications

Off unless `NOTIFY_ON_CREATE=true`. Composing the text always runs; only the
two side effects are gated:

- a `notifications` row with the assembled `summary` (the Bubble "resend last
  WhatsApp" feature reads it back)
- `POST https://gate.whapi.cloud/messages/text`

**The Bubble page workflow still sends its own copy.** Turning this on without
first disabling the Bubble-side send means every request notifies twice. The
group id in the environment is a real, live group.

Build the message with real `\n` — `JSON.stringify` escapes them correctly.
Do not hand-escape. `notifyNewRequest` never throws: a request that saved but
failed to notify is still a saved request.

---

## UI

**Tailwind CSS v4 + shadcn/ui**, components copied into `components/ui/` and
owned by this repo.

> **`components.json` is `"style": "base-nova"` — shadcn on `@base-ui/react`,
> not Radix.** APIs differ (`render` instead of `asChild`, `items` prop on
> `Select`, array values on `ToggleGroup`, `toast.add()` from
> `@/components/ui/toast` rather than `sonner`). Two vendored skills are
> binding for UI work: `.agents/skills/shadcn/SKILL.md` and
> `.agents/skills/shadcn/rules/base-vs-radix.md`.

- Forms use `FieldGroup` + `Field`, never raw `div` + `space-y-*`
- `gap-*` not `space-y-*`; `size-*` when width equals height
- Semantic colour tokens (`bg-muted`, `text-muted-foreground`), never raw palette
- `cn()` for conditional classes
- Theme variables live in `app/globals.css`, not a `tailwind.config.js`
- Loading and error states are required, not optional

Keep client components small. Fetch in server components, pass data down. The
request form is one client island because it holds the whole selection; the
page around it is not.

---

## Reference data and caching

`jobs` alone is 1,445 rows — fifteen round trips at Bubble's page cap, far too
slow to repeat per render. `lib/bubble/reference.ts` memoises each list in
process for five minutes.

That is deliberately prototype-grade: per-instance, lost on restart, and fine
while this runs as a single Next.js process. If it ever scales out, replace it
with `use cache` + `cacheLife` (which needs `cacheComponents: true` in
`next.config.ts`, and that changes rendering semantics app-wide — not a
drive-by change).

`lib/bubble/reference-types.ts` exists because `reference.ts` is `server-only`
and the request form needs the types and `toolTypesFor` in the browser. Keep
pure helpers there, not in the server module.

All 1,445 jobs are handed to the combobox, which makes `/requests/new` a ~670KB
document. `toJobOption` strips `description` — the longest field, and one only
the server reads — which accounted for about 100KB of that. The rest is
inherent to client-side search over the whole list. If it ever matters, the fix
is a route handler doing `text contains` against Bubble per keystroke, trading
payload for latency. For a prototype on localhost it does not matter.

---

## Code conventions

- App Router, TypeScript, server actions for all mutations
- One Bubble client module (`lib/bubble/client.ts`) — retry, rate limiting,
  pagination and error shaping live there and nowhere else
- Domain modules expose domain functions (`createToolRequest`,
  `listRecentRequests`), not raw fetches
- Option set values as `as const` unions in `lib/bubble/enums.ts`
- Zod-validate every payload crossing the network boundary in both directions.
  Bubble returns loosely typed JSON and a renamed field fails silently otherwise
- Never `fetch` Bubble from a client component
- Prettier-enforced (`.prettierrc`): no semicolons, double quotes, 2-space
  indent, `es5` trailing commas, with `prettier-plugin-tailwindcss` sorting
  classes. Run `npm run format`

**Not the Next.js/React you know.** `next@16.2.6`, `react@19.2.4` — versions
with breaking changes relative to training data (see `AGENTS.md`). Read the
relevant guide under `node_modules/next/dist/docs/` before writing Next-specific
code.

---

## Environment

```
AUTH_SECRET=
AUTH_URL=http://localhost:3000

ALLOW_DEV_LOGIN=true               # temporary, localhost only
ALLOW_ENTRA=false                  # true once the credentials exist

AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=

BUBBLE_API_BASE=https://cfaner.bubbleapps.io/version-test/api/1.1
BUBBLE_API_TOKEN=

NOTIFY_ON_CREATE=false
WHAPI_TOKEN=
WHAPI_GROUP_ID=
```

No `DATABASE_URL`. None of these are `NEXT_PUBLIC_`.

---

## Commands

Run from `next-ambient/`:

| | |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm run format` | prettier |
| `npm run check-bubble` | **read-only** smoke test against the live Bubble app |

`check-bubble` needs `tsx --conditions=react-server` — the modules it imports
are `server-only`, which throws under plain Node. No test runner is configured.

---

## Current state

Built and verified against live data:

- `lib/bubble/client.ts` — the single Data API entry point, with 429/5xx retry
  and backoff, cursor pagination and sorting
- `lib/bubble/enums.ts` — `WE_ARE`, `TO_DO`, `requestColor`
- `lib/bubble/dates.ts` — New York wall-clock conversion via `Intl` (two-pass,
  so it is correct across DST boundaries)
- `lib/bubble/reference.ts` / `reference-types.ts` — jobs, tool types, PMs,
  time slots
- `lib/bubble/tools-summary.ts` — the `toolsSummary` codec
- `lib/bubble/requests.ts` — `createToolRequest`, `listRecentRequests`
- `lib/notify.ts` — WhatsApp summary, gated
- `app/(app)/requests` — list and create pages, the create server action
- `app/(app)/layout.tsx` + `components/app-sidebar.tsx` — the signed-in shell
  is a shadcn `Sidebar` (`collapsible="icon"`, a sheet below `md`) plus a
  header holding the trigger. Nav items are only routes that exist; the
  open/collapsed state round-trips through the `sidebar_state` cookie, read in
  the layout so it renders server-side. `hooks/use-mobile.ts` was reworked to
  `useSyncExternalStore` — the shipped version set state in an effect and
  failed `react-hooks/set-state-in-effect`
- `components/request-form.tsx`, `components/tool-picker.tsx`,
  `components/date-picker.tsx` — the form is a two-column layout (fields left,
  tool selection right, stacked below `lg`) with the 112-row catalogue behind a
  dialog, so the initial `/requests/new` document dropped to ~290KB
- Auth.js with the flag-gated `dev-login` and Entra providers; login page

**The write path has not been exercised against the live app.** Every read has;
creating a request would put a real row in the live database, so it is waiting
on a decision to do that.

### Where to go next

- Assigning specific `tools` rows to a request. Note that the schema makes this
  awkward: `requestedtools` links to nothing, so an assignment has no natural
  home without a new field — which is the kind of thing to raise rather than
  invent.
- Materials (`requestedmaterials`: `jobType` + a free-text `materials` list).
  Deliberately skipped; the old app writes one per request.
- `request.pictures` is a text field and unused here.
