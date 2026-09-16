import { redirect } from "next/navigation"

/**
 * The old dispatch board, retired by phase 4.
 *
 * It ticked whole **requests** and sent them out under one driver, which is
 * exactly the constraint this phase removed — a request's tools can now go out
 * on several trips, under several drivers, on several days. `/trips/new` is
 * where that happens.
 *
 * A redirect rather than a deletion because `?requestId=` links to this route
 * are scattered through older screens and, more to the point, sitting in
 * people's browser history and bookmarks. Carrying the param through means such
 * a link still lands somewhere useful instead of on a 404.
 *
 * **The rest of this subtree is not dead yet.** `active/actions.ts` still backs
 * the per-tool pickup buttons on requests dispatched before phase 4, which have
 * no `triptool` rows and so no run sheet to finish them from. Delete the lot
 * once those have drained — see `docs/phase-4-trips.md`.
 */
export default async function DispatchRedirect({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string }>
}) {
  const { requestId } = await searchParams
  redirect(requestId ? `/trips/new?requestId=${requestId}` : "/trips/new")
}
