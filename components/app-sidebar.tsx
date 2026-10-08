"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeftRightIcon,
  ClipboardListIcon,
  ContainerIcon,
  ListIcon,
  LogOutIcon,
  MapPinIcon,
  NavigationIcon,
  PackageIcon,
  PackagePlusIcon,
  PlusIcon,
  RouteIcon,
  ShoppingCartIcon,
  TruckIcon,
  WarehouseIcon,
} from "lucide-react"

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
 * Approval is deliberately not built yet (see CLAUDE.md); it gets an entry
 * here when it gets a route, not before. Materials (phase 5C) sit beside
 * Tools: the catalogue and its stock are the warehouse's, like the tools
 * views, and "Add material" earns its own entry for the same reason
 * "Add tool" does. Assignment reaches its
 * screen from a request's detail page instead of a top-level item of its own;
 * Dispatch is a board like Requests, so it gets one. Active trips is the same
 * call now that it's split off `/dispatch` onto its own route.
 *
 * "Job Dashboard", "Warehouse" and "All Tools" are three different views of
 * the same `tools` table, not three features — the first groups by
 * job/location (`app/(app)/tools/page.tsx`), the second filters to tools
 * actually at the warehouse and groups by tool type
 * (`app/(app)/tools/warehouse/page.tsx`), the third is a flat
 * searchable/paginated grid over everything (`app/(app)/tools/all/page.tsx`).
 * They're separate routes rather than tabs of one screen so each gets its own
 * nav entry and its own back-button history. "Add tool" gets a top-level
 * entry alongside them the way "New delivery request" does under Requests —
 * it's reached from `/tools/all` too, but adding a tool is a thing you set out
 * to do, not something you discover while browsing.
 *
 * "In Transit" sits under Trips rather than Tools: it shows tools *and*
 * materials, and it is the trip rows that say what's on a truck.
 */
const REQUEST_NAV_ITEMS = [
  { title: "Requests", href: "/requests", icon: ClipboardListIcon },
  { title: "New delivery request", href: "/requests/new", icon: TruckIcon },
  { title: "New pickup request", href: "/requests/new/pickup", icon: ShoppingCartIcon },
  // Not a third kind of request — one form that submits the other two. It earns
  // an entry for the same reason "Add tool" does: it's a thing you set out to
  // do, not something you'd find by starting a delivery.
  { title: "New delivery + pickup", href: "/requests/new/combined", icon: ArrowLeftRightIcon },
] as const

const TRIP_NAV_ITEMS = [
  { title: "Trips", href: "/trips", icon: NavigationIcon },
  { title: "New trip", href: "/trips/new", icon: RouteIcon },
  { title: "In Transit", href: "/trips/in-transit", icon: ContainerIcon },
] as const

const TOOL_NAV_ITEMS = [
  { title: "Job Dashboard", href: "/tools", icon: MapPinIcon },
  { title: "Warehouse", href: "/tools/warehouse", icon: WarehouseIcon },
  { title: "All Tools", href: "/tools/all", icon: ListIcon },
  { title: "Add tool", href: "/tools/new", icon: PlusIcon },
] as const

const MATERIAL_NAV_ITEMS = [
  { title: "Materials", href: "/materials", icon: PackageIcon },
  { title: "Add material", href: "/materials/new", icon: PackagePlusIcon },
] as const

const NAV_GROUPS = [
  { label: "Requests", items: REQUEST_NAV_ITEMS },
  { label: "Trips", items: TRIP_NAV_ITEMS },
  { label: "Tools", items: TOOL_NAV_ITEMS },
  { label: "Materials", items: MATERIAL_NAV_ITEMS },
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
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
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
          ))}
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
