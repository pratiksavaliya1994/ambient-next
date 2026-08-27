/**
 * Types (and the one runtime constant) client components need from the
 * `tools` table. Split out of `pickup-tools.ts` because that module is
 * `server-only` — importing even one runtime value from it (not just a
 * type) pulls the whole Bubble client into the client bundle. Same fix as
 * `reference-types.ts` for `reference.ts`.
 */

export type PickupTool = {
  id: string
  name: string
  typeName: string | null
  floor: string | null
  status: string
}

export type DashboardTool = {
  id: string
  name: string
  typeName: string | null
  location: string
  floor: string | null
  status: string
  currentUser: string | null
}

/** Sentinel for rows where `location` is blank — distinct from the literal
 *  "Warehouse" value some rows genuinely have, so the two aren't conflated. */
export const NO_LOCATION = "No location set"
