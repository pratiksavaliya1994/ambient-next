"use server"

import { AuthError } from "next-auth"

import { signIn } from "@/auth"
import { devLoginSchema } from "@/lib/schemas/auth"

const DEFAULT_DESTINATION = "/requests"

/**
 * `signIn` throws a redirect on success, so neither of these returns then.
 * They are server actions rather than client calls so the Entra client secret
 * stays on the server.
 */
export async function signInWithMicrosoft(callbackUrl?: string) {
  await signIn("microsoft-entra-id", {
    redirectTo: callbackUrl ?? DEFAULT_DESTINATION,
  })
}

export async function signInAsDevUser(raw: unknown, callbackUrl?: string): Promise<{ error: string } | undefined> {
  const parsed = devLoginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a name." }
  }

  try {
    await signIn("dev-login", {
      name: parsed.data.name,
      redirectTo: callbackUrl ?? DEFAULT_DESTINATION,
    })
  } catch (error) {
    // The redirect Auth.js throws on success is not an error — rethrow it, or
    // a successful sign-in would be swallowed and reported as a failure.
    if (error instanceof AuthError) {
      return { error: "Could not sign in. Is ALLOW_DEV_LOGIN set?" }
    }
    throw error
  }
}
