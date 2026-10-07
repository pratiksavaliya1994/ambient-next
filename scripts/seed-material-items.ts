/**
 * Seeds `materialitem` from the legacy per-job-type `materials` rows.
 *
 * `npm run seed-material-items`            dry run — prints the plan, writes nothing
 * `npm run seed-material-items -- --apply` writes it
 *
 * Each `materials.List` is free text, one `Name: ` per line, with the job type
 * in `realtedTo`. Lines are matched to existing items by name (case- and
 * trailing-"s"-insensitive, so "Garbage Bags" finds "Garbage bags"). A match
 * only gains the missing job types in `relatedTo`; a new name is created with
 * `stockQty = 0` — opening stock goes through the audited Adjust, as on
 * `/materials/new`. Nothing is ever deleted, and stock is never touched.
 *
 * Talks to the Data API with plain `fetch`: `lib/bubble/client.ts` pulls in the
 * session, which won't load outside Next.
 */
import { TO_DO, type ToDo } from "@/lib/bubble/enums"

const APPLY = process.argv.includes("--apply")
const base = process.env.BUBBLE_API_BASE!.replace(/\/$/, "")
const token = process.env.BUBBLE_API_TOKEN!

/** A guess per new item; anything not listed is `each`. Edit on `/materials` afterwards. */
const UNIT_GUESS: Record<string, string> = {
  concrete: "bag",
  "self-level material": "bag",
  gravel: "bag",
  "sand for epoxy primer, size #1": "bag",
  "sand for epoxy primer, size #00": "bag",
  "any additional sand, aggregate,  grit, oxide for system": "bag",
  primer: "gal",
  "acrylic primer": "gal",
  "epoxy primer": "gal",
  "epoxy system specified for job": "gal",
  densifier: "gal",
  "epoxy grout coat, clear": "gal",
  "epoxy grout coat, gray": "gal",
  "integral dye": "gal",
  "6 mil poly or tarp": "roll",
  "6x6 welded wire": "roll",
  "tie wire": "roll",
  "box of caulk": "box",
  "garbage bag": "box",
}

type Row = { _id: string } & Record<string, unknown>

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  })
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`)
  return res
}

async function listAll(type: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let cursor = 0; ; ) {
    const { response } = (await (await call(`/obj/${type}?limit=100&cursor=${cursor}`)).json()) as {
      response: { results: Row[]; remaining: number }
    }
    rows.push(...response.results)
    if (response.remaining <= 0) return rows
    cursor += response.results.length
  }
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ").replace(/s$/, "")
const IS_TO_DO = new Set<string>(TO_DO)

/** `"Densifier: (overlays) "` → name `Densifier`, note `(overlays)`. */
function parseLine(line: string): { name: string; note: string } | null {
  const [head, ...rest] = line.split(":")
  const name = head.trim()
  if (name === "") return null
  const note = rest.join(":").replace(/:\s*$/, "").trim()
  return { name, note }
}

type Planned = { name: string; relatedTo: Set<ToDo>; notes: Set<string> }

async function main() {
  const [legacy, items] = await Promise.all([listAll("materials"), listAll("materialitem")])

  const wanted = new Map<string, Planned>()
  for (const row of legacy) {
    const jobTypes = ((row.realtedTo as string[] | undefined) ?? []).filter((v): v is ToDo => IS_TO_DO.has(v))
    for (const raw of String(row.List ?? "").split("\n")) {
      const parsed = parseLine(raw)
      if (!parsed) continue
      const k = key(parsed.name)
      const entry = wanted.get(k) ?? { name: parsed.name, relatedTo: new Set<ToDo>(), notes: new Set<string>() }
      jobTypes.forEach((t) => entry.relatedTo.add(t))
      if (parsed.note) entry.notes.add(parsed.note)
      wanted.set(k, entry)
    }
  }

  const existing = new Map(items.map((item) => [key(String(item.name ?? "")), item]))

  const creates: Planned[] = []
  const patches: { item: Row; relatedTo: ToDo[]; added: ToDo[] }[] = []
  for (const [k, entry] of wanted) {
    const item = existing.get(k)
    if (!item) {
      creates.push(entry)
      continue
    }
    const current = new Set((item.relatedTo as string[] | undefined) ?? [])
    // Empty `relatedTo` already means "every job type" — narrowing it would hide the item.
    if (current.size === 0) continue
    const added = [...entry.relatedTo].filter((t) => !current.has(t))
    if (added.length > 0) patches.push({ item, relatedTo: [...current, ...added] as ToDo[], added })
  }

  console.log(`materials rows ${legacy.length} · distinct lines ${wanted.size} · materialitem rows ${items.length}`)
  console.log(`\nCREATE ${creates.length}`)
  for (const c of creates) {
    const unit = UNIT_GUESS[key(c.name)] ?? UNIT_GUESS[c.name.toLowerCase()] ?? "each"
    console.log(`  + ${c.name}  [${unit}]  ${[...c.relatedTo].join(", ")}${c.notes.size ? `  — notes: ${[...c.notes].join("; ")}` : ""}`)
  }
  console.log(`\nADD JOB TYPES to ${patches.length} existing`)
  for (const p of patches) console.log(`  ~ ${p.item.name}  += ${p.added.join(", ")}`)

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.")
    return
  }

  for (const c of creates) {
    const unit = UNIT_GUESS[key(c.name)] ?? UNIT_GUESS[c.name.toLowerCase()] ?? "each"
    await call("/obj/materialitem", {
      method: "POST",
      body: JSON.stringify({
        name: c.name,
        unit,
        stockQty: 0,
        active: true,
        relatedTo: [...c.relatedTo],
        notes: [...c.notes].join("; "),
      }),
    })
    console.log(`created ${c.name}`)
  }
  for (const p of patches) {
    await call(`/obj/materialitem/${p.item._id}`, { method: "PATCH", body: JSON.stringify({ relatedTo: p.relatedTo }) })
    console.log(`patched ${p.item.name}`)
  }
  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
