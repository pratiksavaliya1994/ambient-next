import { cookies } from "next/headers"
import Link from "next/link"

import { ALLOW_DEV_LOGIN } from "@/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/toast"
import { displayNameOf, requireSessionOrRedirect } from "@/lib/auth/session"

/**
 * The signed-in shell: sidebar navigation plus a header that carries the
 * toggle. There are no roles in the Bubble schema, so there is nothing to
 * branch the navigation on — every signed-in user sees everything.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSessionOrRedirect("/requests")

  // `SidebarProvider` writes this cookie on every toggle. Reading it here
  // means the server renders the side the user left it on, so a collapsed
  // sidebar does not flash open on navigation.
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <Toaster>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar userName={displayNameOf(session)} />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 sm:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-4" />
            {/* The sidebar's own brand is offscreen below `md`, so the header
                keeps a way home on small screens. */}
            <Link href="/requests" className="text-sm font-medium">
              Tool requests
            </Link>
          </header>
          {ALLOW_DEV_LOGIN && (
            <p className="border-b bg-destructive/10 px-6 py-2 text-center text-sm text-destructive">
              Development sign-in is on — no password was checked. Writes still
              go to the live Bubble database.
            </p>
          )}
          <div className="flex-1 p-4 sm:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </Toaster>
  )
}
