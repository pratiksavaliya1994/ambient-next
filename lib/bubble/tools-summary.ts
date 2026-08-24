/**
 * `requestedtools` holds the whole tool list for a request in one text field,
 * `toolsSummary`, formatted as quoted `Name: quantity` entries:
 *
 *   "Large Garbage Pails For Water: 1", "Pump Jack Electric: 1", "Spiked Shoes: 2"
 *
 * There is no per-tool row and no link to `toolstype` — the name is the only
 * identifier — so this codec is the whole contract with the old app. Both
 * directions live here so they cannot drift apart.
 *
 * No `server-only`: the request form previews the same formatting client-side.
 */

export type ToolLine = { name: string; quantity: number }

export function formatToolsSummary(lines: readonly ToolLine[]): string {
  return lines
    .filter((line) => line.quantity > 0)
    .map((line) => `"${line.name}: ${line.quantity}"`)
    .join(", ")
}

/**
 * Split on the *last* colon, not the first: live rows include names that
 * contain one, e.g. `"Concrete Mixer: The green one: 2"`.
 */
export function parseToolsSummary(
  summary: string | null | undefined
): ToolLine[] {
  if (!summary) return []

  const lines: ToolLine[] = []
  for (const match of summary.matchAll(/"([^"]*)"/g)) {
    const entry = match[1].trim()
    if (!entry) continue

    const split = entry.lastIndexOf(":")
    if (split === -1) {
      lines.push({ name: entry, quantity: 1 })
      continue
    }

    const quantity = Number(entry.slice(split + 1).trim())
    lines.push({
      name: entry.slice(0, split).trim(),
      // An unparseable tail means the colon belonged to the name, not a count.
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    })
  }
  return lines
}
