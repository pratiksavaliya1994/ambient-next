"use server"

import { signOut } from "@/auth"

/**
 * Sign-out lives in its own action module rather than as a closure in the
 * layout because the sidebar that submits it is a client component, and a
 * client component can only be handed an action it imports by reference.
 *
 * Not in `session.ts`: that module is `server-only`, so importing it from the
 * sidebar would fail the build.
 */
export async function signOutAction() {
  await signOut({ redirectTo: "/login" })
}
