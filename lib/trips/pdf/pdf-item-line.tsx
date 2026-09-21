import "server-only"

import { Text, View } from "@react-pdf/renderer"

import type { RequestStopInfo } from "@/lib/bubble/requests"
import type { TripToolRow } from "@/lib/bubble/trips-types"
import { journeyLabel, type PdfItemTone } from "@/lib/trips/pdf/pdf-helpers"
import { pdfStyles } from "@/lib/trips/pdf/pdf-styles"

const SECTION_LABEL: Record<PdfItemTone, string> = {
  collect: "Pick up",
  drop: "Drop off",
}

/** One labelled block of a stop's work — "Pick up", "Drop off"/"Return", or "Refused here". */
export function PdfItemSection({
  tone,
  label,
  items,
  requests,
  namedJob,
}: {
  tone: PdfItemTone
  /** Overrides `SECTION_LABEL` for `drop`, whose wording depends on the stop kind (`dropOutcome`). */
  label?: string
  items: readonly TripToolRow[]
  requests: ReadonlyMap<string, RequestStopInfo>
  /** Show which job each line is for — only useful when a stop serves more than one request. */
  namedJob: boolean
}) {
  if (items.length === 0) return null

  return (
    <View style={pdfStyles.section}>
      <Text style={pdfStyles.sectionHeader}>
        {label ?? SECTION_LABEL[tone]} ({items.length})
      </Text>
      {items.map((item) => (
        <PdfItemLine key={item.id} item={item} tone={tone} request={namedJob ? requests.get(item.requestId) : undefined} />
      ))}
    </View>
  )
}

function PdfItemLine({
  item,
  tone,
  request,
}: {
  item: TripToolRow
  tone: PdfItemTone
  /** Passed only when the stop serves several requests — appended so the tool reads "for <job>". */
  request?: RequestStopInfo
}) {
  const journey = journeyLabel(item, tone)
  const typeDetail = item.toolType && item.toolType !== item.toolName ? item.toolType : null

  return (
    <View style={pdfStyles.itemLine}>
      <Text style={pdfStyles.itemName}>{item.toolName}</Text>
      {typeDetail && <Text style={pdfStyles.itemDetail}> · {typeDetail}</Text>}
      {journey && <Text style={pdfStyles.itemDetail}> — {journey}</Text>}
      {request && <Text style={pdfStyles.itemDetail}> for {request.job}</Text>}
    </View>
  )
}
