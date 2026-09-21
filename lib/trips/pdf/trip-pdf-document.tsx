import "server-only"

import { Document, Page, Text, View } from "@react-pdf/renderer"

import { newYorkDayLabel } from "@/lib/bubble/dates"
import type { RequestStopInfo } from "@/lib/bubble/requests"
import { stopWork, type TripDetail } from "@/lib/bubble/trips-types"
import { PdfStopBlock } from "@/lib/trips/pdf/pdf-stop-block"
import { pdfStyles } from "@/lib/trips/pdf/pdf-styles"
import { formatClock, minutesOfTime, tripFinishMinutes, tripStartTime } from "@/lib/trips/schedule"

/**
 * The driver-facing run sheet as a PDF — the same stops-in-route-order shape
 * `TripRunSheet` renders on screen, laid out on a page instead of a card
 * stack so it survives being printed or read with no signal.
 */
export function TripRunSheetPdf({
  trip,
  requests,
}: {
  trip: TripDetail
  requests: ReadonlyMap<string, RequestStopInfo>
}) {
  const work = stopWork(trip)
  const startTime = tripStartTime(trip.tripDate)

  return (
    <Document title={pdfTitle(trip)}>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader trip={trip} stopCount={work.length} startTime={startTime} />
        {work.map((entry, index) => (
          <PdfStopBlock
            key={entry.stop.stopKey}
            work={entry}
            position={index + 1}
            startTime={startTime}
            requests={requests}
          />
        ))}
      </Page>
    </Document>
  )
}

function PdfHeader({
  trip,
  stopCount,
  startTime,
}: {
  trip: TripDetail
  stopCount: number
  startTime: string
}) {
  const span =
    stopCount > 0
      ? `${formatClock(minutesOfTime(startTime))} – ${formatClock(tripFinishMinutes(startTime, stopCount))}`
      : null

  return (
    <View>
      <Text style={pdfStyles.headerTitle}>{trip.driver ?? "No driver assigned"}</Text>
      <Text style={pdfStyles.headerMeta}>
        {trip.tripDate ? newYorkDayLabel(trip.tripDate) : "No date"}
        {span ? ` · ${span}` : ""} · {trip.items.length} {trip.items.length === 1 ? "tool" : "tools"} ·{" "}
        {trip.status}
      </Text>
      {trip.notes && <Text style={pdfStyles.notes}>{trip.notes}</Text>}
    </View>
  )
}

function pdfTitle(trip: TripDetail): string {
  const day = trip.tripDate ? newYorkDayLabel(trip.tripDate) : "Undated"
  return `Trip — ${trip.driver ?? "No driver"} — ${day}`
}
