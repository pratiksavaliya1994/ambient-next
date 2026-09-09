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
import { listFieldPms, listJobs, listTimeSlots, listToolTypes, listUsers } from "@/lib/bubble/reference"

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
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
