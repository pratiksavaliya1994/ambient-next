import { renderToBuffer } from "@react-pdf/renderer"
import { NextResponse } from "next/server"

import { requireSessionOrRedirect } from "@/lib/auth/session"
import { listRequestStopInfo, listSiteContacts } from "@/lib/bubble/requests"
import { getTrip } from "@/lib/bubble/trips-read"
import { stopWork, transferSites } from "@/lib/bubble/trips-types"
import { tripPdfFileName } from "@/lib/trips/pdf/pdf-helpers"
import { TripRunSheetPdf } from "@/lib/trips/pdf/trip-pdf-document"

/**
 * The run sheet, as a PDF a driver can carry with no signal.
 *
 * A route handler rather than a server action: this is a GET returning a
 * binary body, and a plain `<a href>` on the trip page is the whole client
 * side of it — no blob URL, no client component. Layouts don't wrap route
 * handlers, so the auth check that `AppLayout` gives every page has to be
 * made again here, the same as every server action does.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  await requireSessionOrRedirect(`/trips/${tripId}`)

  const trip = await getTrip(tripId)
  if (!trip) return new NextResponse("Trip not found", { status: 404 })

  const requestIds = [...new Set(trip.items.map((item) => item.requestId).filter((id): id is string => id !== ""))]
  const requestInfo = await listRequestStopInfo(requestIds)
  const requests = new Map(requestInfo.map((request) => [request.id, request]))
  // A PDF can't stream a late detail in, so this one is awaited — but it only
  // reads anything when the route has a site-to-site transfer on it.
  const siteContacts = await listSiteContacts(transferSites(stopWork(trip), requests))

  const buffer = await renderToBuffer(
    <TripRunSheetPdf trip={trip} requests={requests} siteContacts={siteContacts} />
  )

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${tripPdfFileName(trip)}"`,
    },
  })
}
