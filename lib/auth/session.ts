import "server-only"

import { redirect } from "next/navigation"

import { auth } from "@/auth"

/**
 * There are no roles in the Bubble schema, so this is authentication only:
 * signed in or not. Every signed-in user reaches every screen.
 *
 * Still called at the top of each server action rather than relied on from
 * `proxy.ts`, which only redirects for UX and is not a security boundary
 * (CVE-2025-29927). Server actions are reachable by direct POST.
 */

export class NotAuthorizedError extends Error {
  constructor(message = "You are not signed in.") {
    super(message)
    this.name = "NotAuthorizedError"
  }
}

export async function requireSession() {
  const session = await auth()
  if (!session?.user) throw new NotAuthorizedError()
  return session
}

/** Sends an unauthenticated visitor to the login page, preserving where they were headed. */
export async function requireSessionOrRedirect(returnTo: string) {
  const session = await auth()
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`)
  }
  return session
}

/** What to put on a request when the schema has no requester field: a display name. */
export function displayNameOf(session: { user?: { name?: string | null; email?: string | null } }): string {
  return session.user?.name || session.user?.email || "Unknown"
}

/**
 * Who is making the current write, for `tools.lastEditedBy`.
 *
 * Every write reaches Bubble under the API token, so `Created By` on the
 * `toolshistory` row `DB - Tools Change Log` produces is always the token's
 * user. The only thing that log can see is the `tools` row before and after,
 * so the person's name has to ride along *on* that row — this is the value
 * that goes there, and the log copies it into `toolshistory.doneBy`.
 */
export async function currentActor(): Promise<string> {
  return displayNameOf((await auth()) ?? {})
}
