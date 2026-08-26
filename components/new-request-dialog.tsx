"use client"

import type { ComponentType } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRightIcon, PackagePlusIcon, PlusIcon, ShoppingCartIcon, TruckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

const REQUEST_TYPES = [
  {
    href: "/requests/new",
    label: "Delivery",
    description: "Request items, materials or tools to be delivered to the job site.",
    icon: TruckIcon,
    accent: "delivery",
  },
  {
    href: "/requests/new/pickup",
    label: "Pickup",
    description: "Request items, materials or tools to be picked up from the job site.",
    icon: ShoppingCartIcon,
    accent: "pickup",
  },
] as const

/**
 * The trigger doubles as the prefetch signal: both target routes are warmed
 * on hover/focus of the trigger and again on open, so the click inside the
 * popup is a client-side navigation into an already-fetched route rather than
 * a cold one.
 */
export function NewRequestDialog() {
  const router = useRouter()

  const prefetchBoth = () => {
    for (const type of REQUEST_TYPES) router.prefetch(type.href)
  }

  return (
    <Dialog onOpenChange={(open) => open && prefetchBoth()}>
      <DialogTrigger
        render={
          <Button onMouseEnter={prefetchBoth} onFocus={prefetchBoth} className="hidden md:inline-flex">
            <PlusIcon data-icon="inline-start" />
            New request
          </Button>
        }
      />

      <DialogContent className="gap-6 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">New Request</DialogTitle>
          <DialogDescription className="text-center text-sm">
            What type of request would you like to create?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {REQUEST_TYPES.map((type) => (
            <RequestTypeCard key={type.href} {...type} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The `NewRequestDialog` trigger hides below `md` (see its `hidden md:inline-flex`
 * button above); this is its replacement there — a floating action button that
 * opens the same two destinations in a bottom drawer instead of a centered dialog.
 */
export function NewRequestFab() {
  const router = useRouter()

  const prefetchBoth = () => {
    for (const type of REQUEST_TYPES) router.prefetch(type.href)
  }

  return (
    <Drawer showSwipeHandle onOpenChange={(open) => open && prefetchBoth()}>
      <DrawerTrigger
        render={
          <Button
            onClick={prefetchBoth}
            size="icon-lg"
            aria-label="New request"
            className="group fixed right-5 bottom-5 z-40 size-14 rounded-full border border-border/70 bg-background/90 text-foreground shadow-[0_8px_30px_rgb(0_0_0/0.28)] ring-1 ring-foreground/10 backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-105 hover:border-primary/50 hover:shadow-[0_12px_40px_rgb(0_0_0/0.38)] focus-visible:ring-2 focus-visible:ring-primary/60 active:translate-y-0 active:scale-95 md:hidden dark:bg-card/90 dark:shadow-[0_8px_30px_rgb(0_0_0/0.65)] dark:ring-white/15"
          >
            <PlusIcon className="size-6 text-foreground transition-transform duration-300 group-hover:rotate-90" />
            <span className="sr-only">New request</span>
          </Button>
        }
      />

      <DrawerContent>
        <DrawerHeader className="items-center">
          <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <PackagePlusIcon className="size-6" />
          </span>
          <DrawerTitle className="text-lg text-balance">What type of request would you like to create?</DrawerTitle>
          <DrawerDescription>Choose the request type to get started.</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-3 p-4">
          {REQUEST_TYPES.map((type) => (
            <RequestTypeRow key={type.href} {...type} />
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

const ACCENTS = {
  delivery: {
    border: "border-delivery/25 hover:border-delivery/60 hover:bg-delivery/5",
    wash: "border-delivery/30 bg-delivery/8 hover:bg-delivery/14",
    iconBg: "bg-delivery/15 text-delivery-foreground",
    text: "text-delivery-foreground",
  },
  pickup: {
    border: "border-pickup/25 hover:border-pickup/60 hover:bg-pickup/5",
    wash: "border-pickup/30 bg-pickup/8 hover:bg-pickup/14",
    iconBg: "bg-pickup/15 text-pickup-foreground",
    text: "text-pickup-foreground",
  },
} as const

function RequestTypeCard({
  href,
  label,
  description,
  icon: Icon,
  accent,
}: {
  href: string
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
  accent: keyof typeof ACCENTS
}) {
  const theme = ACCENTS[accent]

  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "group flex flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        theme.border
      )}
    >
      <span className={cn("flex size-12 items-center justify-center rounded-full", theme.iconBg)}>
        <Icon className="size-6" />
      </span>
      <span className={cn("font-medium", theme.text)}>{label}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
      <ArrowRightIcon className={cn("size-4 transition-transform group-hover:translate-x-0.5", theme.text)} />
    </Link>
  )
}

/** The full-width row layout used by `NewRequestFab`'s drawer. */
function RequestTypeRow({
  href,
  label,
  description,
  icon: Icon,
  accent,
}: {
  href: string
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
  accent: keyof typeof ACCENTS
}) {
  const theme = ACCENTS[accent]

  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "group flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        theme.wash
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full bg-popover shadow-xs ring-1 ring-black/5",
          theme.text
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-semibold", theme.text)}>{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <ArrowRightIcon className={cn("size-4 shrink-0 transition-transform group-hover:translate-x-0.5", theme.text)} />
    </Link>
  )
}
