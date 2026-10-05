import "server-only"

import { Text, View } from "@react-pdf/renderer"

import type { RequestStopInfo } from "@/lib/bubble/requests"
import {
  isPickupMaterial,
  isTransferMaterial,
  materialQtyLabel,
  pickupQtyLabel,
  type TripMaterialRow,
} from "@/lib/bubble/trip-materials-types"
import { journeyLabel, type PdfItemTone } from "@/lib/trips/pdf/pdf-helpers"
import { pdfStyles } from "@/lib/trips/pdf/pdf-styles"

const SECTION_LABEL: Record<PdfItemTone, string> = {
  collect: "Pick up",
  drop: "Drop off",
}

/**
 * A stop's material lines for one half of its work, printed under that half's
 * tools: "Pick up — materials (2)", then `20 bag  Level-Flor — to <job>` per
 * line. The quantity leads, since the driver is counting bags, not names.
 *
 * A **pickup** line at its collect (5G) prints its estimate as "about 10 bag"
 * and a blank **"Collected: ____"** for a driver working from paper. A
 * transfer reads "→ Site B" there, and "from Site A" where it lands.
 */
export function PdfMaterialSection({
  tone,
  label,
  materials,
  requests,
  namedJob,
}: {
  tone: PdfItemTone
  /** Overrides `SECTION_LABEL` for `drop`, whose wording depends on the stop kind (`dropOutcome`). */
  label?: string
  materials: readonly TripMaterialRow[]
  requests: ReadonlyMap<string, RequestStopInfo>
  /** Show which job each line is for — only useful when a stop serves more than one request. */
  namedJob: boolean
}) {
  if (materials.length === 0) return null

  return (
    <View style={pdfStyles.section}>
      <Text style={pdfStyles.sectionHeader}>
        {label ?? SECTION_LABEL[tone]} — materials ({materials.length})
      </Text>
      {materials.map((row) => (
        <PdfMaterialLine
          key={row.id}
          row={row}
          tone={tone}
          request={namedJob ? requests.get(row.requestId) : undefined}
        />
      ))}
    </View>
  )
}

function PdfMaterialLine({
  row,
  tone,
  request,
}: {
  row: TripMaterialRow
  tone: PdfItemTone
  request?: RequestStopInfo
}) {
  const pickup = isPickupMaterial(row)
  const counting = pickup && tone === "collect"
  const journey = counting && isTransferMaterial(row) ? `→ ${row.toLocation}` : journeyLabel(row, tone)

  return (
    <View style={pdfStyles.itemLine}>
      <Text style={pdfStyles.itemName}>
        {pickup ? pickupQtyLabel(row) : materialQtyLabel(row)} {row.name}
      </Text>
      {journey && <Text style={pdfStyles.itemDetail}> — {journey}</Text>}
      {request && <Text style={pdfStyles.itemDetail}> for {request.job}</Text>}
      {counting && <Text style={pdfStyles.itemName}>{"   "}Collected: ________</Text>}
    </View>
  )
}
