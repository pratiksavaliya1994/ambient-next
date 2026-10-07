import "server-only"

import { z } from "zod"

import { bubbleListAll } from "@/lib/bubble/client"
import { DEFAULT_REQUEST_STATUS, isOpenRequest, isPickupRequest, REQUEST_STATUS } from "@/lib/bubble/enums"
import { listMaterialLines } from "@/lib/bubble/requested-materials"
import { lineProgress, pickupLineStatus, type MaterialLine } from "@/lib/bubble/requested-materials-types"
import { listTripMaterialsForLines } from "@/lib/bubble/tripmaterial-read"

/**
 * The site page's "Open pickups from this site" (5G §5): every material line
 * on an open pickup request at one job that hasn't come back yet, with where
 * it's going.
 *
 * Three reads: the job's requests (one `equals` on `request.job`, which holds
 * the name), their lines (one `in`), and those lines' trip rows. Direction and
 * status are filtered here rather than by constraint — a job carries few
 * requests, and `status` is absent on the legacy rows, which read as `New`.
 *
 * Its own module because `requests.ts` is far past the 300-line cap.
 */

const requestRow = z.looseObject({
  _id: z.string(),
  delivery: z.boolean().optional(),
  pickup: z.boolean().optional(),
  status: z.enum(REQUEST_STATUS).optional(),
  requestDateStart: z.string().optional(),
})

export type SitePickupLine = {
  line: MaterialLine
  /** The pickup's `requestDateStart`. */
  start: string | null
  /** A trip holds it now (planned or on the truck). */
  onTrip: boolean
  /** Already come back, as counted — a line split across trips is part-collected. */
  collected: number
}

export async function listOpenSitePickups(job: string): Promise<SitePickupLine[]> {
  const requests = (await bubbleListAll("request", { constraints: [{ key: "job", constraint_type: "equals", value: job }] }))
    .map((raw) => requestRow.parse(raw))
    .filter(
      (row) =>
        isPickupRequest({ delivery: row.delivery ?? false, pickup: row.pickup ?? false }) &&
        isOpenRequest(row.status ?? DEFAULT_REQUEST_STATUS)
    )
  if (requests.length === 0) return []

  const startOf = new Map(requests.map((row) => [row._id, row.requestDateStart ?? null]))
  const byRequest = await listMaterialLines([...startOf.keys()])
  const lines = [...byRequest.values()].flatMap((materials) => materials.lines)
  if (lines.length === 0) return []

  const tripRows = await listTripMaterialsForLines(lines.map((line) => line.id))
  return lines
    .map((line) => ({ line, status: pickupLineStatus(line, tripRows) }))
    .filter(({ status }) => status !== "done")
    .map(({ line, status }) => ({
      line,
      start: startOf.get(line.requestId) ?? null,
      onTrip: status === "live",
      collected: lineProgress(line, tripRows, { pickup: true }).delivered,
    }))
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "") || a.line.name.localeCompare(b.line.name))
}
