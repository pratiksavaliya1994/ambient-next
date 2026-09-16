"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardListIcon, LogOutIcon, MapPinIcon, NavigationIcon, RouteIcon, ShoppingCartIcon, TruckIcon } from "lucide-react"

import { TooltipProvider } from "@/components/ui/tooltip"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { signOutAction } from "@/lib/auth/actions"

/**
 * Every route that exists behind sign-in, and nothing else. There are no roles
 * in the Bubble schema, so there is nothing to branch this list on — every
 * signed-in user sees every item.
 *
 * Approval and materials are deliberately not built yet (see CLAUDE.md); they
 * get entries here when they get routes, not before. Assignment reaches its
 * screen from a request's detail page instead of a top-level item of its own;
 * Dispatch is a board like Requests, so it gets one. Active trips is the same
 * call now that it's split off `/dispatch` onto its own route.
 */
const NAV_ITEMS = [
  { title: "Requests", href: "/requests", icon: ClipboardListIcon },
  { title: "Trips", href: "/trips", icon: NavigationIcon },
  { title: "New trip", href: "/trips/new", icon: RouteIcon },
  { title: "New delivery request", href: "/requests/new", icon: TruckIcon },
  { title: "New pickup request", href: "/requests/new/pickup", icon: ShoppingCartIcon },
  { title: "Tools", href: "/tools", icon: MapPinIcon },
] as const

/**
 * The signed-in navigation. A client component only because the active item
 * comes from `usePathname` — the shell around it stays on the server.
 *
 * `collapsible="icon"` on desktop, and below `md` the same markup is rendered
 * into a sheet by `Sidebar` itself, so there is no separate mobile nav to keep
 * in sync. `TooltipProvider` is here rather than in the root layout because
 * the collapsed-state labels are the only tooltips in the app so far.
 */
export function AppSidebar({ userName }: { userName: string }) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const closeOnMobile = () => isMobile && setOpenMobile(false)

  return (
    <TooltipProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Tool workflow"
                render={<Link href="/requests" onClick={closeOnMobile} />}
              >
                <Image src="/icon.svg" alt="" width={32} height={32} className="size-8 shrink-0 rounded-md" />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-medium">Ambient Flooring</span>
                  <span className="truncate text-xs text-muted-foreground">Tool workflow</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workflow</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      // Exact match: `/requests/new` is its own item, so
                      // prefix matching would light both rows up at once.
                      isActive={pathname === item.href}
                      tooltip={item.title}
                      render={<Link href={item.href} onClick={closeOnMobile} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Signed in as {userName}
              </p>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <form action={signOutAction}>
                <SidebarMenuButton type="submit" tooltip="Sign out" className="w-full">
                  <LogOutIcon />
                  <span>Sign out</span>
                </SidebarMenuButton>
              </form>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </TooltipProvider>
  )
}
