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
    <div className="grid min-h-svh grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0b1220] p-10 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "repeating-linear-gradient(115deg, transparent 0 78px, currentColor 78px 79px)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-[#c6a664]/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-white/5 blur-3xl"
        />

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md border border-[#c6a664]/40 text-xs font-semibold tracking-wide text-[#c6a664]">
            AF
          </span>
          <span className="text-sm font-medium tracking-[0.25em] text-white/70 uppercase">Ambient Flooring</span>
        </div>

        <div className="relative z-10 max-w-md">
          <p className="text-xs font-semibold tracking-[0.3em] text-[#c6a664] uppercase">
            Tool &amp; Equipment Workflow
          </p>
          <h1 className="mt-4 font-heading text-4xl leading-tight font-semibold text-balance">
            Brilliance beneath every job site.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-balance text-white/60">
            Request, schedule, and track tools and equipment across every Ambient Flooring project, from one unified
            workspace.
          </p>
        </div>

        <p className="relative z-10 text-xs text-white/40">
          © {new Date().getFullYear()} Ambient Flooring. Internal tool portal.
        </p>
      </div>

      <div className="flex min-w-0 flex-col items-center justify-center gap-8 p-6 md:p-10">
        <div className="flex w-full max-w-sm min-w-0 flex-col gap-6">
          <div className="flex items-center justify-center gap-2.5 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-md bg-[#0b1220] text-xs font-semibold tracking-wide text-[#c6a664]">
              AF
            </span>
            <span className="text-sm font-medium tracking-[0.25em] text-foreground/80 uppercase">Ambient Flooring</span>
          </div>

          <LoginForm
            callbackUrl={callbackUrl}
            allowEntra={ALLOW_ENTRA}
            allowDevLogin={ALLOW_DEV_LOGIN}
            initialError={error ? (AUTH_ERRORS[error] ?? "Could not sign you in. Please try again.") : undefined}
          />
        </div>
      </div>
    </div>
  )
}
