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
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-[#eef1f6] text-[#0b1220] dark:bg-[#0b1220] dark:text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-[#c6a664]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-[#0b1220]/5 blur-3xl dark:bg-white/5"
      />

      <header className="relative z-10 flex items-center justify-between px-4 py-5 sm:px-6 sm:py-6 md:px-10">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#c6a664]/40 text-xs font-semibold tracking-wide text-[#c6a664]">
            AF
          </span>
          <span className="truncate text-xs font-medium tracking-[0.15em] text-[#0b1220]/70 uppercase sm:text-sm sm:tracking-[0.25em] dark:text-white/70">
            Ambient Flooring
          </span>
        </div>
        <span className="hidden shrink-0 text-xs font-medium tracking-[0.25em] text-[#0b1220]/40 uppercase sm:block dark:text-white/40">
          Internal Portal
        </span>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex w-full max-w-sm min-w-0 flex-col items-center gap-3 text-center sm:gap-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#c6a664] uppercase sm:tracking-[0.3em]">
            Tool &amp; Equipment Workflow
          </p>
          <h1 className="font-heading text-3xl leading-tight font-semibold text-balance sm:text-4xl">
            Sign in to your workspace
          </h1>
          <p className="text-sm leading-relaxed text-balance text-[#0b1220]/60 sm:text-base dark:text-white/60">
            Request, schedule, and track tools across every Ambient Flooring job site.
          </p>

          <div className="mt-2 w-full">
            <LoginForm
              callbackUrl={callbackUrl}
              allowEntra={ALLOW_ENTRA}
              allowDevLogin={ALLOW_DEV_LOGIN}
              initialError={error ? (AUTH_ERRORS[error] ?? "Could not sign you in. Please try again.") : undefined}
            />
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex flex-col items-center justify-between gap-1 px-4 py-5 text-center text-xs text-[#0b1220]/40 sm:flex-row sm:gap-0 sm:px-6 sm:py-6 sm:text-left md:px-10 dark:text-white/40">
        <span>© {new Date().getFullYear()} Ambient Flooring</span>
        <span>Internal tool portal</span>
      </footer>
    </div>
  )
}
