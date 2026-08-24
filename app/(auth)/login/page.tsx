import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { ALLOW_DEV_LOGIN, ALLOW_ENTRA, auth } from "@/auth"
import { LoginForm } from "@/components/login-form"

export const metadata: Metadata = { title: "Sign in" }

/** Auth.js reports OAuth failures back to `pages.error`, which is this page. */
const AUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That account is already linked to another sign-in.",
  AccessDenied: "Your account does not have access to this app.",
  Configuration: "Sign-in is misconfigured. Contact an administrator.",
  Verification: "That sign-in link is no longer valid.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const { callbackUrl, error } = await searchParams

  const session = await auth()
  if (session?.user) redirect(callbackUrl ?? "/requests")

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <LoginForm
          callbackUrl={callbackUrl}
          allowEntra={ALLOW_ENTRA}
          allowDevLogin={ALLOW_DEV_LOGIN}
          initialError={
            error
              ? (AUTH_ERRORS[error] ??
                "Could not sign you in. Please try again.")
              : undefined
          }
        />
      </div>
    </div>
  )
}
