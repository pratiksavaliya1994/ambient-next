import "server-only"

/**
 * The single entry point to the Bubble Data API.
 *
 * Every Bubble call in this app goes through here — retry, rate-limit
 * handling, pagination and error shaping live here and nowhere else.
 * The admin token is read from the server environment and must never
 * reach the browser.
 */

const MAX_LIMIT = 100
const MAX_ATTEMPTS = 4

export class BubbleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message)
    this.name = "BubbleError"
  }
}

/**
 * The message plus Bubble's own reason, when it gave one — its 4xx bodies are
 * `{ body: { status, message } }` (workflows) or `{ status, message }`, and the
 * `message` is what says which parameter it refused.
 */
export function describeBubbleError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  if (!(error instanceof BubbleError) || !error.body) return error.message
  let reason: string | undefined
  try {
    const parsed = JSON.parse(error.body) as { message?: unknown; body?: { message?: unknown } }
    const message = parsed.body?.message ?? parsed.message
    if (typeof message === "string") reason = message
  } catch {
    reason = error.body.slice(0, 300)
  }
  return reason ? `${error.message} — ${reason}` : error.message
}

export type Constraint = {
  key: string
  constraint_type:
    | "equals"
    | "not equal"
    | "is_empty"
    | "is_not_empty"
    | "greater than"
    | "less than"
    | "in"
    | "not in"
    | "text contains"
  value?: unknown
}

/** A row as Bubble returns it: `_id` plus arbitrary, loosely typed fields. */
export type BubbleThing = { _id: string } & Record<string, unknown>

type ListPage = {
  results: BubbleThing[]
  cursor: number
  count: number
  remaining: number
}

function config() {
  const base = process.env.BUBBLE_API_BASE
  const token = process.env.BUBBLE_API_TOKEN
  if (!base || !token) {
    throw new BubbleError("BUBBLE_API_BASE and BUBBLE_API_TOKEN must be set", 500)
  }
  return { base: base.replace(/\/$/, ""), token }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Bubble rate-limits by plan and this app is on a low tier, so 429 and 5xx
 * are retried with exponential backoff. 4xx other than 429 fail immediately —
 * retrying a bad request just burns quota.
 */
async function request(path: string, init: RequestInit = {}, origin?: string): Promise<Response> {
  const { base, token } = config()

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${origin ?? base}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    })

    if (res.ok) return res

    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new BubbleError(
        `Bubble ${init.method ?? "GET"} ${path} failed with ${res.status}`,
        res.status,
        await res.text().catch(() => undefined)
      )
    }

    const retryAfter = Number(res.headers.get("retry-after"))
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250)
  }
}

export type ListOptions = {
  constraints?: Constraint[]
  limit?: number
  cursor?: number
  /** A Bubble API field name, e.g. `"Created Date"`. */
  sortField?: string
  descending?: boolean
}

/** One page of results. `limit` is capped at 100 by Bubble. */
export async function bubbleList(type: string, options: ListOptions = {}): Promise<ListPage> {
  const params = new URLSearchParams({
    limit: String(Math.min(options.limit ?? MAX_LIMIT, MAX_LIMIT)),
    cursor: String(options.cursor ?? 0),
  })
  if (options.constraints?.length) {
    params.set("constraints", JSON.stringify(options.constraints))
  }
  if (options.sortField) {
    params.set("sort_field", options.sortField)
    params.set("descending", String(options.descending ?? false))
  }

  const res = await request(`/obj/${type}?${params}`)
  const json = (await res.json()) as { response?: Partial<ListPage> }
  const page = json.response ?? {}

  return {
    results: page.results ?? [],
    cursor: page.cursor ?? 0,
    count: page.count ?? 0,
    remaining: page.remaining ?? 0,
  }
}

/** Every matching row, following the cursor until Bubble reports none remaining. */
export async function bubbleListAll(
  type: string,
  options: Omit<ListOptions, "cursor" | "limit"> = {}
): Promise<BubbleThing[]> {
  const all: BubbleThing[] = []
  let cursor = 0

  for (;;) {
    const page = await bubbleList(type, { ...options, cursor })
    all.push(...page.results)
    if (page.remaining <= 0 || page.results.length === 0) return all
    cursor += page.results.length
  }
}

/**
 * A `bubbleListAll` that treats "no such type" as "no rows".
 *
 * Only 404 is swallowed, and only with a warning — a type that exists and
 * errors for any other reason still throws, because a read that silently
 * reports "nothing is here" is worse than a broken page.
 *
 * Written when the assign UI shipped ahead of its Bubble schema, and kept
 * because a missing type should degrade to an empty screen rather than a crash.
 * Lives here rather than in one domain module now that the trip reads need it
 * for the same reason — three new types that don't exist until someone creates
 * them in Studio.
 *
 * **It also hides a typo'd type name indefinitely**, so a new type is worth
 * confirming once with a real `GET /obj/{type}` before trusting an empty list.
 */
export async function bubbleListMaybeMissing(
  type: string,
  options: Omit<ListOptions, "cursor" | "limit"> = {}
): Promise<BubbleThing[]> {
  try {
    return await bubbleListAll(type, options)
  } catch (error) {
    if (error instanceof BubbleError && error.status === 404) {
      console.warn(`[bubble] type "${type}" does not exist yet — treating as empty.`)
      return []
    }
    throw error
  }
}

export async function bubbleGet(type: string, id: string): Promise<BubbleThing | null> {
  try {
    const res = await request(`/obj/${type}/${id}`)
    const json = (await res.json()) as { response?: BubbleThing }
    return json.response ?? null
  } catch (error) {
    if (error instanceof BubbleError && error.status === 404) return null
    throw error
  }
}

export async function bubbleCreate(type: string, data: Record<string, unknown>): Promise<string> {
  const res = await request(`/obj/${type}`, {
    method: "POST",
    body: JSON.stringify(data),
  })
  const json = (await res.json()) as { id?: string }
  if (!json.id) {
    throw new BubbleError(`Bubble create ${type} returned no id`, 502)
  }
  return json.id
}

/**
 * Runs a Bubble backend (API) workflow — `POST /wf/{name}` — rather than a
 * `/obj/{type}` Data API write. Used for flows a single workflow owns
 * end-to-end (e.g. creating a `request` and its `requestedtools` row and
 * sending the WhatsApp notification in one server-side step in Bubble).
 *
 * Bubble nests a workflow's "Return data from API" values under a `response`
 * key on the Data API, but that isn't independently confirmed for every
 * workflow response shape — this falls back to the raw body if `response`
 * isn't present, so a caller's own schema is what actually enforces the shape.
 */
export async function bubbleRunWorkflow(name: string, data: Record<string, unknown>): Promise<unknown> {
  const res = await request(`/wf/${name}`, {
    method: "POST",
    body: JSON.stringify(data),
  })
  const json = (await res.json()) as { response?: unknown }
  return json.response ?? json
}

/**
 * Uploads a file to Bubble's **file manager** and returns the URL it landed on.
 *
 * Not a Data API call, and the one place in this app that isn't. `/fileupload`
 * sits at the *app root* — one level above `/api/1.1` — so the origin is
 * derived by stripping that suffix from `BUBBLE_API_BASE` rather than
 * configured as a second environment variable that could drift out of sync
 * with the first. It still goes through `request`, so it inherits the same
 * bearer token, retry and backoff as everything else.
 *
 * The body is `{ name, private, contents }`, `contents` being base64 with **no
 * `data:` prefix**. The response is a bare JSON string — not the `{ response }`
 * envelope the Data API uses — holding a **protocol-relative** URL
 * (`//<hash>.cdn.bubble.io/f…/name.jpg`). That is exactly the shape the legacy
 * `tools.photo` values already carry, so it is stored verbatim and given a
 * scheme only at render time (`photoSrc`).
 *
 * `private: false` leaves the file attached to no thing, matching every file
 * already in this app's manager. A private file would need Bubble to mint a
 * signed URL per view, which nothing rendering an `<img>` here could use.
 *
 * **Nothing deletes these.** The Data API has no file endpoint, so dropping a
 * URL from a `photos` list orphans the file rather than removing it; clearing
 * orphans out is a File manager job inside Bubble.
 */
export async function bubbleUploadFile(name: string, contentsBase64: string): Promise<string> {
  const { base } = config()
  const origin = base.replace(/\/api\/1\.1$/, "")
  if (origin === base) {
    throw new BubbleError("BUBBLE_API_BASE must end in /api/1.1 to locate the file upload endpoint", 500)
  }

  const res = await request(
    "/fileupload",
    { method: "POST", body: JSON.stringify({ name, private: false, contents: contentsBase64 }) },
    origin
  )

  const url: unknown = await res.json()
  if (typeof url !== "string" || url === "") {
    throw new BubbleError("Bubble file upload returned no URL", 502)
  }
  return url
}

export async function bubblePatch(type: string, id: string, data: Record<string, unknown>): Promise<void> {
  await request(`/obj/${type}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function bubbleDelete(type: string, id: string): Promise<void> {
  await request(`/obj/${type}/${id}`, { method: "DELETE" })
}
