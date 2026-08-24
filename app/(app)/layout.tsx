import Link from "next/link"
import { PlusIcon } from "lucide-react"

import { ALLOW_DEV_LOGIN, signOut } from "@/auth"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/toast"
import { displayNameOf, requireSessionOrRedirect } from "@/lib/auth/session"

/**
 * The signed-in shell. There are no roles in the Bubble schema, so there is
 * nothing to branch the navigation on — every signed-in user sees everything.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSessionOrRedirect("/requests")

  return (
    <Toaster>
      <div className="flex min-h-svh flex-col">
        <header className="flex flex-wrap items-center gap-4 border-b px-6 py-3">
          <Link href="/requests" className="font-medium">
            Tool requests
          </Link>
          <Button
            render={<Link href="/requests/new" />}
            nativeButton={false}
            size="sm"
            variant="outline"
          >
            <PlusIcon data-icon="inline-start" />
            New request
          </Button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {displayNameOf(session)}
            </span>
            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: "/login" })
              }}
            >
              <Button type="submit" size="sm" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        {ALLOW_DEV_LOGIN && (
          <p className="border-b bg-destructive/10 px-6 py-2 text-center text-sm text-destructive">
            Development sign-in is on — no password was checked. Writes still go
            to the live Bubble database.
          </p>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </Toaster>
  )
}
