import "server-only"

import { Text, View } from "@react-pdf/renderer"

import type { RequestStopInfo } from "@/lib/bubble/requests"
import { dropOutcome, type StopWork } from "@/lib/bubble/trips-types"
import { PdfItemSection } from "@/lib/trips/pdf/pdf-item-line"
import { stopRequests } from "@/lib/trips/pdf/pdf-helpers"
import { pdfStyles } from "@/lib/trips/pdf/pdf-styles"
import { formatWindow, stopWindow } from "@/lib/trips/schedule"

/**
 * One stop, laid out the way the on-screen run sheet reads it: a numbered
 * marker, the time and place, who to ask for if the stop serves a single
 * request, then what to collect / drop / leave behind.
 */
export function PdfStopBlock({
  work,
  position,
  startTime,
  requests,
}: {
  work: StopWork
  position: number
  startTime: string
  requests: ReadonlyMap<string, RequestStopInfo>
}) {
  const window = formatWindow(stopWindow(startTime, position - 1))
  const kindLabel = work.stop.kind === "Warehouse" ? "Warehouse" : "Job site"
  const contacts = stopRequests(work, requests)
  // Named per line only once a single contact block can no longer say whose
  // tool is whose — the common case (one request per stop) stays uncluttered.
  const namedJob = contacts.length > 1
  // `work.refused` is deliberately left out: it's what a stop turned away, a
  // fact about how the trip actually went rather than the plan, and the PDF
  // never prints it. See `PdfItemTone`.
  const nothingHere = work.collect.length === 0 && work.drop.length === 0

  return (
    <View style={pdfStyles.stopRow} wrap={false}>
      <View style={pdfStyles.stopRail}>
        <View style={pdfStyles.stopBadge}>
          <Text style={pdfStyles.stopBadgeText}>{position}</Text>
        </View>
      </View>
      <View style={pdfStyles.stopCard}>
        <Text style={pdfStyles.stopTime}>{window}</Text>
        <Text style={pdfStyles.stopLocation}>{work.stop.location}</Text>
        <Text style={pdfStyles.stopKind}>{kindLabel}</Text>

        {contacts.length === 1 && <PdfContactBlock request={contacts[0]} />}
        {contacts.length > 1 && (
          <View style={pdfStyles.contactBlock}>
            {contacts.map((request) => (
              <Text key={request.id} style={pdfStyles.contactLine}>
                {request.job}
                {request.contact ? ` — ${request.contact}` : ""}
                {request.contactPhone ? ` (${request.contactPhone})` : ""}
              </Text>
            ))}
          </View>
        )}

        {nothingHere && <Text style={pdfStyles.emptyStop}>Nothing happens here.</Text>}
        <PdfItemSection tone="collect" items={work.collect} requests={requests} namedJob={namedJob} />
        <PdfItemSection
          tone="drop"
          label={dropOutcome(work.stop.kind).verb}
          items={work.drop}
          requests={requests}
          namedJob={namedJob}
        />
      </View>
    </View>
  )
}

/** Who to ask for on site — the same three fields `TripStopItemLine`'s popover shows. */
function PdfContactBlock({ request }: { request: RequestStopInfo }) {
  return (
    <View style={pdfStyles.contactBlock}>
      <Text style={pdfStyles.contactLine}>{request.job}</Text>
      {request.contact && <Text style={pdfStyles.contactLine}>Contact: {request.contact}</Text>}
      {request.contactPhone && <Text style={pdfStyles.contactLine}>Phone: {request.contactPhone}</Text>}
      {request.floor && <Text style={pdfStyles.contactLine}>Floor: {request.floor}</Text>}
    </View>
  )
}
