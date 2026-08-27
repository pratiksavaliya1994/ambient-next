"use client"

import { useState } from "react"
import { AlertCircleIcon, LogInIcon, TriangleAlertIcon } from "lucide-react"

import { signInAsDevUser, signInWithMicrosoft } from "@/app/(auth)/login/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

type Pending = "dev" | "microsoft" | null

export function LoginForm({
  callbackUrl,
  allowEntra,
  allowDevLogin,
  initialError,
}: {
  callbackUrl?: string
  allowEntra: boolean
  allowDevLogin: boolean
  initialError?: string
}) {
  const [pending, setPending] = useState<Pending>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(initialError ?? null)

  async function onMicrosoft() {
    setError(null)
    setPending("microsoft")
    // A successful sign-in navigates away, so `pending` is only reset on failure.
    await signInWithMicrosoft(callbackUrl)
    setPending(null)
  }

  async function onDevLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending("dev")
    const result = await signInAsDevUser({ name }, callbackUrl)
    if (result?.error) {
      setError(result.error)
      setPending(null)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {error && (
        <Alert variant="destructive" className="text-left">
          <AlertCircleIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-xl border border-black/8 bg-white text-left shadow-lg dark:border-white/10 dark:bg-white/3 dark:shadow-2xl">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          {allowDevLogin && (
            <>
              <Alert className="border-[#c6a664]/30 bg-[#c6a664]/5">
                <TriangleAlertIcon className="text-[#c6a664]" />
                <AlertTitle>Development sign-in</AlertTitle>
                <AlertDescription>
                  No password is checked. Your name is only used to label requests on screen.
                </AlertDescription>
              </Alert>

              <form onSubmit={onDevLogin}>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="name">Your name</FieldLabel>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Daithi Murphy"
                      autoComplete="name"
                      autoFocus
                      className="h-10"
                    />
                    <FieldDescription>The Field PM on a request is picked separately, on the form.</FieldDescription>
                  </Field>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={name.trim().length < 2 || pending !== null}
                  >
                    {pending === "dev" ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <LogInIcon data-icon="inline-start" />
                    )}
                    Continue
                  </Button>
                </FieldGroup>
              </form>
            </>
          )}

          {allowDevLogin && allowEntra && <FieldSeparator>or</FieldSeparator>}

          {allowEntra && (
            <Button
              onClick={onMicrosoft}
              disabled={pending !== null}
              size="lg"
              className="w-full border border-black/15 bg-white text-[#0b1220] hover:bg-white/90 dark:border-white/15"
            >
              {pending === "microsoft" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <MicrosoftIcon data-icon="inline-start" />
              )}
              Continue with Microsoft
            </Button>
          )}

          {!allowEntra && !allowDevLogin && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>No sign-in is enabled</AlertTitle>
              <AlertDescription>
                Set ALLOW_ENTRA or ALLOW_DEV_LOGIN in .env.local and restart the dev server.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {allowEntra && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-black/8 bg-black/2 px-5 py-3 text-xs font-medium tracking-normal text-[#0b1220]/50 uppercase sm:px-6 sm:tracking-wide dark:border-white/10 dark:bg-white/2 dark:text-white/50">
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            SSO enabled · ambientflooring.com
          </div>
        )}
      </div>

      <p className="text-center text-xs leading-relaxed text-[#0b1220]/40 dark:text-white/40">
        {allowEntra ? "Access is managed by your Microsoft work account. " : null}
        Trouble signing in?{" "}
        <a href="mailto:it@ambientflooring.com" className="text-blue-600 hover:underline dark:text-blue-400">
          Contact an administrator
        </a>
      </p>
    </div>
  )
}

function MicrosoftIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
