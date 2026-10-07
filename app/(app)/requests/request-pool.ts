import "server-only"

import type { TripPoolState } from "@/components/request-card-action"
import { shownMovements } from "@/lib/trips/movement-types"
import { listOutstandingMovements } from "@/lib/trips/movements"

/**
 * The trip builder's own pool, read alongside a list of cards so a card offers
 * "Add to a trip" only when the builder would list it. A failed pool read
 * costs the cards that check (`null`), not the whole list.
 */
export async function loadPoolState(): Promise<(requestId: string) => TripPoolState> {
  const groups = await listOutstandingMovements().catch(() => null)
  if (!groups) return () => null

  const shownIds = new Set(shownMovements(groups).map((group) => group.requestId))
  const pooledIds = new Set(groups.map((group) => group.requestId))
  return (id) => (shownIds.has(id) ? "waiting" : pooledIds.has(id) ? "claimed" : "none")
}
