import type { RequestStopInfo, SiteContact } from "@/lib/bubble/requests"
import { isTransferCollect, type StopWork } from "@/lib/bubble/trips-types"

/**
 * The distinct requests a stop's items point back to, in first-seen order.
 *
 * Who to ask for at a stop, shared by the PDF's contact block and the run
 * sheet's stop header so the two can't disagree. A job site normally serves
 * one request, but a warehouse stop can carry items for several — so the PDF
 * (which has no popover to look one up in) shows the contact block only when
 * there is exactly one, and falls back to naming the job per tool line
 * otherwise. See `pdf-stop-block.tsx`. Only `collect`/`drop` are considered,
 * matching what both actually show — a request that shows up solely on this
 * stop's `refused` list would otherwise name a contact for nothing.
 *
 * A **transfer collect** (`isTransferCollect`) adds its site's own contact
 * from `siteContacts` instead of its request, whose contact is at the far end
 * of the journey. That entry is skipped if the stop already carries a request
 * for this same site (its contact is the one to ask for), or if the site has
 * no contact on file.
 */
export function stopRequests(
  work: StopWork,
  requests: ReadonlyMap<string, RequestStopInfo>,
  siteContacts: ReadonlyMap<string, SiteContact>
): RequestStopInfo[] {
  const seen = new Set<string>()
  const list: RequestStopInfo[] = []
  const add = (request: RequestStopInfo | undefined) => {
    if (!request || seen.has(request.id)) return
    seen.add(request.id)
    list.push(request)
  }

  let transfer = false
  for (const item of [...work.collect, ...work.collectMaterials]) {
    const request = requests.get(item.requestId)
    if (isTransferCollect(work.stop, request)) transfer = true
    else add(request)
  }
  for (const item of [...work.drop, ...work.dropMaterials]) add(requests.get(item.requestId))

  const site = transfer ? siteContacts.get(work.stop.location) : undefined
  if (site && !list.some((request) => request.job === work.stop.location)) {
    list.push({
      id: `site:${work.stop.location}`,
      job: work.stop.location,
      ...site,
      floor: null,
      delivery: false,
      pickup: false,
    })
  }
  return list
}
