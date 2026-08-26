"use client"

import { useState } from "react"
import { AlertCircleIcon, LogInIcon, TriangleAlertIcon } from "lucide-react"

import { signInAsDevUser, signInWithMicrosoft } from "@/app/(auth)/login/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
    <Card className="gap-0 overflow-hidden py-0 shadow-lg ring-1 ring-foreground/[0.07]">
      <div className="h-1 w-full bg-linear-to-r from-[#0b1220] via-[#c6a664] to-[#0b1220]" />
      <CardHeader className="gap-1.5 pt-6">
        <CardTitle className="text-xl">Sign in to your workspace</CardTitle>
        <CardDescription>Manage tool and equipment requests for Ambient Flooring job sites.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-2 pb-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {allowDevLogin && (
          <>
            <Alert>
              <TriangleAlertIcon />
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
                  {pending === "dev" ? <Spinner data-icon="inline-start" /> : <LogInIcon data-icon="inline-start" />}
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
            variant={allowDevLogin ? "outline" : "default"}
            size="lg"
            className="w-full"
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
      </CardContent>
      <div className="border-t border-border/70 bg-muted/30 px-6 py-3 text-center text-xs text-muted-foreground">
        Having trouble signing in? Contact your administrator.
      </div>
    </Card>
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
