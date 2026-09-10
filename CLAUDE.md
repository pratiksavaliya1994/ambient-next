# CLAUDE.md

Guidance for Claude Code working in this repository.

The project lives in `next-ambient/` — the working root for all commands. The outer `Ambient/` folder has no project files.

## What this is

Next.js frontend for the Tipp Floor Covering / Ambient Flooring tool workflow. **Bubble.io stays as the database and backend; there is no application database.** Next.js replaces only the UI.

**Scope built:** request creation (delivery + pickup), and a Tools dashboard. A PM picks a job, job type, date + slot, tool _types with quantities_, and optional free-text materials; submit writes one `request` row and one `requestedtools` row. A list page reads requests back with tool types and counts. The Pickup flow additionally picks physical `tools` rows and writes their `status` back.

**In progress — phase 2:** the request lifecycle (assign → dispatch → offload) and the tool location lifecycle. Design and build sheets live in [`docs/phase-2-lifecycle.md`](docs/phase-2-lifecycle.md); **read that before touching `tools`, `assignedtools`, or `request.status`.** The Bubble Studio steps are in [`docs/bubble-request-status-workflow.md`](docs/bubble-request-status-workflow.md).

**Not built:** approve/reject, QR scanning, GPS.

## Before changing anything

**The Bubble app is live and its schema is fixed.** `https://cfaner.bubbleapps.io/version-test/api/1.1` is nominally the dev branch but is the only version in use — treat it as production. ~1,450 jobs, ~1,550 requests of real data.

- Do not add, rename, retype or delete a Bubble field.
- Do not write while exploring. Reads are free; every write is a real row.
- If something needs a new field: work with what's there, or ask.
- Bubble is the source of truth for schema. Read `meta/swagger.json`, don't guess.
- **The Bubble API token never reaches the browser.** All calls go through server components / server actions. No `NEXT_PUBLIC_` var holds a token or write base URL.
- Do not introduce Postgres, Prisma, Drizzle, or any ORM.

## Architecture

```
Browser
  └─ Next.js (App Router)
       ├─ Auth.js v5 — JWT sessions, no database
       │    ├─ dev-login  (temporary, no password)
       │    └─ Entra ID   (the real one, off until creds exist)
       └─ server-only Bubble client ──> Bubble Data API (token server-side only)
```

## Auth

Auth.js v5, `session: { strategy: 'jwt' }`, no adapter, no database.

| Flag | Provider | Status |
| --- | --- | --- |
| `ALLOW_DEV_LOGIN` | `dev-login` (Credentials) | **On.** Temporary. |
| `ALLOW_ENTRA` | Microsoft Entra ID | Off until credentials exist. |

**`dev-login` checks nothing** — type a name, get a session. Safe on localhost and nowhere else, since this app writes to the live database; the shell shows a red banner while it's active.

Switching to Entra: flip both flags, then delete the provider from `auth.ts`, `lib/schemas/auth.ts`, `signInAsDevUser`, and the banner. Both providers resolve to the same session shape and **nothing downstream may branch on which was used.** Entra creds are the same ones Bubble's API Connector uses ("New Login" entry); `/api/auth/callback/microsoft-entra-id` must be a registered redirect URI for localhost and production or sign-in fails with AADSTS50011.

### The session is not a Bubble user

The live `user` type has **no `email`, `Role` or `passwordHash`** — only `displayName`, `id`, `tempConsumable`, `tempNotification`, `tempTools` plus system fields; the address sits in an opaque `authentication` object the Data API can't constrain on. So there's nothing to look a signed-in person up by, and no attempt is made:

- The session identifies the person **to the UI only** — `session.user.name`/`.email` feed the WhatsApp summary's "New request from …" line and the header.
- **`Created By` is the API token's owner**, not the submitter. Never use it in a constraint written from Next.js.
- **There are no roles.** Every signed-in user reaches every screen. `lib/auth/session.ts` is `requireSession()` only. Ownership of a request is whatever `fieldPM2` says.
- No password provider, and there won't be — no field to hold a hash.

`proxy.ts` redirects unauthenticated visitors for UX only. It is **not** a security boundary (CVE-2025-29927): every server action calls `requireSession()` itself, because server actions are reachable by direct POST.

## Bubble Data API

Base: `BUBBLE_API_BASE`. Header: `Authorization: Bearer ${BUBBLE_API_TOKEN}`.

`npm run check-bubble` is a read-only smoke test over every read path — run it first when anything looks wrong.

**Read:** `GET /obj/{type}?constraints=[...]&limit=100&cursor=0&sort_field=Created%20Date&descending=true` → `{ response: { results, cursor, count, remaining } }`. `limit` maxes at 100 — always paginate on `remaining > 0`. Constraint types: `equals`, `not equal`, `is_empty`, `is_not_empty`, `greater than`, `less than`, `in`, `not in`, `text contains`. `in` takes an array and is how tool lines are fetched for a page of requests in one call.

**Write:** `POST /obj/{type}` → `{ id }`; `PATCH /obj/{type}/{id}`; `DELETE /obj/{type}/{id}`. No bulk endpoint, no transactions.

**Type mapping:** linked thing → `_id` string; option set → **display text** (e.g. `"Grind & Epoxy"`); date → ISO 8601; yes/no → boolean; list → array. Swagger marks option-set fields but **doesn't expose their values** — those in `lib/bubble/enums.ts` were read off live rows. An option-set write with an unrecognised value **fails silently**.

**Backend workflows:** don't break the three pre-existing ones (`/wf/googleDataToDB`, `/wf/Set Location`, `/wf/Set Status`) — this app doesn't call them. There's also `DB - Tools Change Log`, a pre-existing **data-event** workflow (not an exposed endpoint, so no `/wf/` name) that fires automatically on `A tools is modified` and writes the `toolshistory` audit row for every tool edit, regardless of who made it — this app relies on it firing rather than logging history itself (see the `tools`/`toolshistory` notes below). This app calls one of its own, `/wf/new-request` (below) — the sole exception to "everything is Data API CRUD."

## Data model — as it actually is

Verified off live Swagger + 200 recent `request` rows, all 112 `toolstype`, all 1,445 `jobs`, 100 `requestedtools`.

### `request`

Header row, 24 business fields. The ones this app writes:

| Field | Type | Notes |
| --- | --- | --- |
| `job` | text | The job **name**, e.g. `"107 Greenwich St - J24-0407"`. Not a link to `jobs`. |
| `toDo` | option set | Job type. Also filters the tool catalogue via `toolstype.realtedTo`. |
| `weAre` | option set | `Ambient` / `Tipp` / `BT Flooring` / `Pyramid Floors` |
| `delivery`, `pickup` | yes/no | Both can be true. |
| `requestDate` | date | **Midnight New York** on the first day. Never carries a time. |
| `requestDateStart` | date | The delivery **instant** — first day at the chosen slot's hour. The `new-request` workflow's ClickUp + Outlook Calendar steps read it as the appointment time. |
| `requestDateEnd` | date | **Midnight New York** on the day tools are needed until. No time of its own. |
| `timeRange` | text | The chosen slot's label on rows this app writes (e.g. `06:00 a.m. to 06:30 a.m.`) — Bubble has no time-of-day text field, so this doubles as it, and its hour feeds `requestDateStart`. Older rows hold free text (`Anytime`, `6-8am`, `TBD`). |
| `floor` | text | `14`, `ground`, `loading dock`, `Suite 139`. |
| `contact`, `contactPhone` | text | |
| `fieldPM2` | text | The PM's name. **This is the one written.** |
| `fieldPM` | option set | Legacy, empty on all recent rows. Not written. |
| `notes` | text | |
| `tentative`, `completed` | yes/no | |
| `color` | text | Calendar colour: `#2299ff` when delivery, `#ff7744` pickup-only. |
| `order` | number | Always `100`. |
| `searchable` | text | What Bubble's search box matches: job `description` + ` - ` + date as `M-D-YYYY h:mm am` ET. |

Not written: `pictures`, `onClickUp`, `realGC`, `Slug`.

### `requestedtools`

**One row per request** — not per tool, not per unit. `requestID` (text, the request `_id`, not a link — no referential integrity), `toolsSummary` (the whole tool list as one string), `toolsNotes` (free text).

`toolsSummary` is quoted `Name: quantity` entries, comma-separated: `"Pump Jack Electric: 1", "Spiked Shoes: 2"`. The name is the **only** identifier; no link to `toolstype`. **Parse by splitting on the last colon, not the first** — live names contain colons (`"Concrete Mixer: The green one: 2"` is one tool, qty 2). Both directions of the codec live in `lib/bubble/tools-summary.ts` so they can't drift.

### `toolstype`

Catalogue, 112 rows. `name` (the identifier as far as `toolsSummary` cares), `realtedTo` (list of option set — **the misspelling is Bubble's, keep it** — which `toDo` values the tool is offered for; `Fast Request` appears in no list, so it means "show everything"), `consumable` (yes/no), `notes`. `quantity`, `order`, `clickUpID` mostly empty.

### `jobs`

1,445 rows. `name` is what `request.job` stores; `description` is the longer `name + details` string feeding `request.searchable`. Also `gc`, `borough`, `details`, `status` (mixed numbers and words — not a usable filter). `lastRequest` is text holding the most recent `request._id` for that job — same id-as-text pattern — kept current by the `new-request` workflow, not by this repo.

### `pms`

12 rows. `Name` and `Company` are option sets (display text). `Active` is set on exactly one row, so it is **not** used as a filter.

### `timelabels`

The 14 half-hour slots the Bubble calendar lays requests out on (`06:00 a.m. to 06:30 a.m.` … `07:00 p.m. to 07:30 p.m.`). The form's "Time slot" picker does double duty: the label goes into `timeRange`, its hour combines with `startDate` to become `requestDateStart` — so `slotHour` (`lib/schemas/request.ts`) and `timeRange` are always set together from one pick.

### `materials`

6 rows, one per job type with a default list ("Fast Request" and "Simple Grind" have none). `List` is the default free text (newline-separated `Concrete:`, `6x6 welded wire:` …); `realtedTo` is the same misspelled option-set-list shape. A _starting point_ for the form's Materials popup, not a picker — PMs type free text; there's no material catalogue.

### `tools`

Individual physical units, distinct from the `toolstype` catalogue. Read by the Pickup flow and the Tools dashboard (`lib/bubble/pickup-tools.ts`), never memoised — status and location are exactly what changes between visits. `name`; `type` (a **real link** to `toolstype._id`); `location` (free text matching a `jobs.name` exactly, or `"Warehouse"`, or blank → `NO_LOCATION`); `status` (the original option set — now only written by the old Bubble UI, this app no longer reads or writes it); `statusNew` (the phase 2 lifecycle option set — see `TOOL_STATUS_NEW` — read and written by this app); `floor`; `currentUser` (a display-name text, not a `user` link, empty on most rows).

The Pickup flow's per-tool `statusNew` write-back is fanned out inside Bubble from `new-pickup-request` via `update-tool-status` (originally built against the old `status` field — see `bubble-pickup-tool-status-workflow.md` — and since repointed at `statusNew` on the Bubble side). Phase 2 additionally writes `location` on dispatch and offload, via `update-request-status`; see [`docs/phase-2-lifecycle.md`](docs/phase-2-lifecycle.md). Note the old Bubble UI is a **second writer** of `location` (and of the old `status` field) via the pre-existing `/wf/Set Status` and `/wf/Set Location` — and, like every other writer of `tools`, its edits also flow into `toolshistory` via `DB - Tools Change Log` (~1,542 pre-existing rows, `prevStatus`/`newStatus` typed to the old `Tool Status` option set). That data-event workflow logs **every** `tools` save automatically, so neither `update-request-status` nor `update-tool-status` log history themselves — they just edit `tools` fields and let `DB - Tools Change Log` do the rest, including populating two lifecycle-typed fields (`prevStatusNew`/`newStatusNew`, option set `ToolStatusNew`) added specifically so it wouldn't have to squeeze `ToolStatusNew` values into the old `Tool Status`-typed `prevStatus`/`newStatus`. An earlier design had `update-request-status` write its own explicit `toolshistory` row per tool; that duplicated `DB - Tools Change Log`'s automatic one and was removed 2026-09-10 (see `docs/bubble-update-request-status-spec.md`).

### Types this app does not touch

`consumables`, `materialsfromebom`. `notifications` is written from inside Bubble by the `new-request` workflow (step 5), mirroring the old page workflow.

`toolshistory` is never written directly by this app or by any of its workflows — `update-request-status` only edits `tools`, and `DB - Tools Change Log` (a pre-existing, always-on data-event workflow outside this project) is what turns that edit into a `toolshistory` row, the same as it does for every other writer of `tools` (see the `tools` section above and `docs/phase-2-lifecycle.md`). It already held ~1,542 rows from the old Bubble UI's `/wf/Set Status`/`/wf/Set Location` before this app started editing `tools` at all.

`requestedmaterials` (`jobType` + free-text `materials`, one row per request) isn't written here either — the workflow owns row creation. The form sends `materials` on every submit (empty string when none), but **the workflow doesn't yet turn a non-empty value into a row** — that step still needs adding on the Bubble side. The summary line for it is already live in `buildSummary`.

## The flow that is built

### Creating a request

**Nothing is written to Bubble until submit.** Tool selection lives entirely in client state — no draft rows, no session key; abandoning the form leaves the database untouched. Worth preserving: the old Bubble UI stages selection in `user.tempTools` and never cleans up abandoned entries.

1. `app/(app)/requests/new/page.tsx` loads jobs, tool types, PMs and time slots server-side and passes them in.
2. `components/request-form.tsx` — `react-hook-form` + `zodResolver` against the same `requestFormSchema` used server-side. Non-native widgets (`Select`, `Combobox`, `ToggleGroup`, `Switch`, `DatePicker`, tool picker) go through `Controller`; `job`, `movement` and the tool `selected` map stay local state (the widget needs more than its one schema field) and push derived values in via `setValue`. Submit calls `createRequestAction` directly from `handleSubmit`'s callback inside a `useTransition` — no `<form action>`/`useActionState`.
3. `app/(app)/requests/actions.ts` re-validates, looks up the job, builds the WhatsApp text (`buildSummary`), then makes **one** call: `createToolRequest` (`lib/bubble/requests.ts`) → `POST /wf/new-request` with the form values (including the job's `_id` as `jobId` alongside `job`, its name), the tool summary and the WhatsApp text as one payload. That workflow — owned in Bubble Studio, not this repo — creates the `request` and `requestedtools` rows, stamps that job's `lastRequest` (`request.job` is only ever a name, so `jobId` is what finds the row), sends the WhatsApp/ClickUp/Calendar notifications, and returns `{ requestId }`. `bubble-new-request-workflow-summary.md` is the as-built reference; it supersedes `bubble-create-request-workflow.md`.
4. `revalidatePath('/requests')`.

Partial failure (a `request` row without its `requestedtools` row) now lives inside Bubble, not here.

### Reading requests back

`listRecentRequests` is two queries, not one per request: a page of requests sorted by `Created Date`, then all their tool rows in one `in` lookup on `requestID`. A request can carry more than one `requestedtools` row (the Bubble UI writes a fresh one per submit), so lines are merged and quantities summed.

## WhatsApp notifications

Sending is entirely Bubble's job, inside the `new-request` workflow. This app holds no Whapi token, writes no `notifications` row, and never calls `gate.whapi.cloud`. `WHAPI_TOKEN` / `WHAPI_GROUP_ID` / `NOTIFY_ON_CREATE` are gone from this environment.

`lib/notify.ts` exports exactly one thing, `buildSummary` — pure text composition. It builds the message with real newlines (`JSON.stringify` escapes them correctly; do not hand-escape). Exactly one send per request created through this app.

## UI

**Tailwind CSS v4 + shadcn/ui**, components copied into `components/ui/` and owned by this repo.

> **`components.json` is `"style": "base-nova"` — shadcn on `@base-ui/react`, not Radix.** APIs differ (`render` not `asChild`, `items` prop on `Select`, array values on `ToggleGroup`, `toast.add()` from `@/components/ui/toast` not `sonner`). Two vendored skills are binding for UI work: `.agents/skills/shadcn/SKILL.md` and `.agents/skills/shadcn/rules/base-vs-radix.md`.

- Forms use `FieldGroup` + `Field`, never raw `div` + `space-y-*`
- `gap-*` not `space-y-*`; `size-*` when width equals height
- Semantic colour tokens (`bg-muted`, `text-muted-foreground`), never raw palette
- `cn()` for conditional classes; theme variables in `app/globals.css`, not a `tailwind.config.js`
- Loading and error states are required
- Keep client components small — fetch in server components, pass data down. The request form is one client island; the page around it is not.

## Reference data and caching

`jobs` alone is 1,445 rows — fifteen round trips at Bubble's page cap, too slow per render. `lib/bubble/reference.ts` memoises each list in process for five minutes. Deliberately prototype-grade: per-instance, lost on restart, fine as a single process. Scaling out means `use cache` + `cacheLife`, which needs `cacheComponents: true` in `next.config.ts` and changes rendering semantics app-wide — not a drive-by change.

`lib/bubble/reference-types.ts` exists because `reference.ts` is `server-only` and the form needs the types and `toolTypesFor` in the browser. Keep pure helpers there.

All 1,445 jobs go to the combobox; `toJobOption` strips `description` (~100KB, server-read only). The rest is inherent to client-side search over the whole list. If it ever matters, the fix is a route handler doing `text contains` per keystroke, trading payload for latency.

## Code conventions

- App Router, TypeScript, server actions for all mutations
- One Bubble client module (`lib/bubble/client.ts`) — retry, rate limiting, pagination and error shaping live there and nowhere else
- Domain modules expose domain functions (`createToolRequest`, `listRecentRequests`), not raw fetches
- Option set values as `as const` unions in `lib/bubble/enums.ts`
- Zod-validate every payload crossing the network boundary **in both directions** — Bubble returns loosely typed JSON and a renamed field fails silently otherwise
- Never `fetch` Bubble from a client component
- Prettier-enforced (`.prettierrc`): no semicolons, double quotes, 2-space indent, `es5` trailing commas, `prettier-plugin-tailwindcss` sorting classes

**Not the Next.js/React you know.** `next@16.2.6`, `react@19.2.4` — breaking changes relative to training data (see `AGENTS.md`). Read the relevant guide under `node_modules/next/dist/docs/` before writing Next-specific code.

## Component size & structure rules

Strict, non-negotiable — apply while writing code, not as a later cleanup pass:

1. **No component over 100 lines.** Past that, extract a subcomponent — reuse an existing shared component if one already fits, otherwise create a new one.
2. **No file over 300 lines**, full stop.
3. **No file holds more than 3 components.**
4. **Anything reusable across more than one feature goes in a shared folder** (`components/ui/` for primitives, `components/` for cross-feature building blocks) — not left local to the page/feature that happened to need it first.

When a file is about to cross one of these limits, split it before finishing the change rather than after.

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
```

No `DATABASE_URL`. None are `NEXT_PUBLIC_`.

## Commands

Run from `next-ambient/`: `npm run dev`, `build`, `typecheck` (`tsc --noEmit`), `lint`, `format`, and `check-bubble` (**read-only** smoke test against the live Bubble app). `check-bubble` needs `tsx --conditions=react-server` — the modules it imports are `server-only` and throw under plain Node. No test runner is configured.

## Current state

Built against live data: the Bubble modules (`client.ts` — retry/backoff, cursor pagination, plus `bubbleRunWorkflow` for `/wf/{name}`; `enums.ts`; `dates.ts` — NY wall-clock via a two-pass `Intl` conversion, correct across DST; `reference.ts`/`reference-types.ts`; `tools-summary.ts`; `requests.ts`), `lib/notify.ts`, `app/(app)/requests` (list + create pages, create action), the signed-in shell, the form components, and flag-gated Auth.js with a login page.

Two non-obvious bits: the shell's sidebar open/collapsed state round-trips through the `sidebar_state` cookie, read in the layout so it renders server-side; and `hooks/use-mobile.ts` was reworked to `useSyncExternalStore` because the shipped version set state in an effect and failed `react-hooks/set-state-in-effect`. The form is two-column (fields left, tools right, stacked below `lg`) with the 112-row catalogue behind a dialog, keeping `/requests/new` at ~290KB; materials is one free-text popup, pre-filled from `defaultMaterialsFor` the first time it opens for a given `toDo` and left alone on every reopen.

**The write path is built on both sides but not yet exercised end-to-end.** The Bubble workflow is built (see `bubble-new-request-workflow-summary.md`), was renamed to `new-request` partway through (this app matches), and adds steps beyond the original spec (`jobs.lastRequest`, a `Notifications` row, ClickUp, Outlook Calendar). `requestDateStart` carries the delivery instant precisely so the ClickUp and Calendar steps keep working unmodified now that `requestDateStart`/`requestDateEnd` span a date range rather than a one-hour slot — no Bubble-side change, only how `lib/bubble/requests.ts` computes it. Every read path is exercised; a create puts a real row in the live database, so the write path is a testing task, not a build one.

### Where to go next

- Assigning specific `tools` rows to a request — **now phase 2A**, designed and in progress. `requestedtools` links to nothing, so an assignment had no natural home; the answer agreed with the user is a new `assignedtools` child type mirroring `requestedtools`, plus `request.status` and `request.driver`. Start at [`docs/phase-2a-assignment.md`](docs/phase-2a-assignment.md).
- The `new-request` workflow's `requestedmaterials` step: create a row (`materials` + `toDo` as `jobType`) when the form's `materials` field is non-empty, the same way it already creates `requestedtools`. This app already sends it.
- `request.pictures` is a text field, unused here.
