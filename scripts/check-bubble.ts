/**
 * Read-only smoke test against the live Bubble app.
 *
 * `npm run check-bubble`
 *
 * Every call here is a GET. Nothing is created, patched or deleted — the app
 * this points at is the one the business runs on, so keep it that way.
 *
 * Needs `tsx --conditions=react-server`: the modules it imports are marked
 * `server-only`, which throws under plain Node.
 */
import { listRecentRequests, listRequestsByStatus } from "@/lib/bubble/requests"
import { listAllTools, listToolLocations, listToolsForJob } from "@/lib/bubble/pickup-tools"
import { listFieldPms, listJobs, listTimeSlots, listToolTypes, listUsers } from "@/lib/bubble/reference"
import { listTripDetails } from "@/lib/bubble/trips-read"
import { listOutstandingMovements } from "@/lib/trips/movements"

async function main() {
  const [jobs, toolTypes, pms, slots, users] = await Promise.all([
    listJobs(),
    listToolTypes(),
    listFieldPms(),
    listTimeSlots(),
    listUsers(),
  ])

  console.log(`jobs        ${jobs.length}\t e.g. ${jobs[0]?.name}`)
  console.log(`toolstype   ${toolTypes.length}\t e.g. ${toolTypes[0]?.name}`)
  console.log(`pms         ${pms.length}\t e.g. ${pms[0]?.name}`)
  console.log(`timelabels  ${slots.length}\t e.g. ${slots[0]?.label}`)
  console.log(`user        ${users.length}\t e.g. ${users[0]?.name}`)

  // Phase 3A: both `tools` read paths parse `condition` alongside `statusNew`
  // — a schema mismatch here would otherwise only surface once the Pickup
  // picker or Tools dashboard tried to render it.
  const allTools = await listAllTools()
  const firstTool = allTools[0]
  console.log(
    `tools       ${allTools.length}\t e.g. ${firstTool?.name} (status: ${firstTool?.status || "—"}, condition: ${firstTool?.condition || "—"})`
  )

  if (jobs[0]) {
    const jobTools = await listToolsForJob(jobs[0].name)
    const firstJobTool = jobTools[0]
    console.log(
      `tools @ job ${jobTools.length}\t e.g. ${firstJobTool?.name ?? "(none at " + jobs[0].name + ")"} (condition: ${firstJobTool?.condition || "—"})`
    )
  }

  // Phase 4: every distinct `tools.location` string, untrimmed, so a warehouse
  // name can be hardcoded from what is actually there rather than from memory.
  // `location` is matched against `jobs.name` with `equals` and nothing enforces
  // referential integrity, so `"Warehouse "` and `"warehouse"` are real hazards
  // — hence the delimiters and the `jobs` cross-check below.
  const locations = await listToolLocations()
  const jobNames = new Set(jobs.map((job) => job.name))
  console.log(`\ndistinct tools.location  ${locations.length}`)
  for (const { value, count } of locations) {
    const label = value === "" ? "(blank)" : `«${value}»`
    const known = value === "" || jobNames.has(value) ? "" : "   ⚠ no jobs row with this exact name"
    console.log(`  ${String(count).padStart(4)}  ${label}${known}`)
  }

  const requests = await listRecentRequests(5)
  console.log(`\nlast ${requests.length} requests:`)
  for (const request of requests) {
    const tools = request.tools.map((t) => `${t.name} x${t.quantity}`).join(", ") || "—"
    console.log(`  ${request.job}\n    ${request.toDo ?? "—"} · ${tools}`)
  }

  // Phase 2B: the Dispatch board's two reads. Both are expected to come back
  // empty until `update-request-status` exists and something actually writes
  // these statuses — a 0 here isn't a failure, just unexercised.
  const [assigned, inTransit] = await Promise.all([
    listRequestsByStatus("Assigned"),
    listRequestsByStatus("In Transit"),
  ])
  console.log(`\nrequest.status = Assigned      ${assigned.length}`)
  console.log(`request.status = In Transit    ${inTransit.length}`)

  // Phase 4. `listTripDetails` reads all three new types, so this is the whole
  // trip read path in one call.
  //
  // **A zero here is ambiguous and that matters**: `bubbleListMaybeMissing`
  // turns a 404 into an empty list, so "no trips" and "the type name is wrong"
  // look identical from here. Confirm the types exist with a raw
  // `GET /obj/trip` the first time — see `docs/bubble-trip-workflows-spec.md` §1.
  const trips = await listTripDetails(["Planned", "In Transit"])
  console.log(`\nopen trips                     ${trips.length}`)
  for (const trip of trips) {
    const route = trip.stops.map((stop) => stop.location).join(" → ") || "no stops"
    console.log(`  ${trip.driver ?? "(no driver)"} · ${trip.status} · ${trip.items.length} tools`)
    console.log(`    ${route}`)
  }

  // Phase 4's movement pool — what the trip builder offers. Reads open requests,
  // their `assignedtools`, the live `tools`, and the claim check.
  const groups = await listOutstandingMovements()
  const waiting = groups.reduce((sum, group) => sum + group.movements.length, 0)
  console.log(`\noutstanding movements          ${waiting} across ${groups.length} requests`)
  for (const group of groups.slice(0, 5)) {
    console.log(`  [${group.direction}] ${group.job} → ${group.destination}  (${group.movements.length} to move)`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
