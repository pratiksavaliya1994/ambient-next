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
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const { base, token } = config()

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${base}${path}`, {
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

export async function bubblePatch(type: string, id: string, data: Record<string, unknown>): Promise<void> {
  await request(`/obj/${type}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function bubbleDelete(type: string, id: string): Promise<void> {
  await request(`/obj/${type}/${id}`, { method: "DELETE" })
}
