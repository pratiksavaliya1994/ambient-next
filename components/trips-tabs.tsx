"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * The `/trips` tab switcher — `?tab=` drives which section the server renders
 * below, so this component only ever navigates; it holds no fetched data of
 * its own. Same `router.push` + `useTransition` idiom `request-search.tsx`
 * uses for its own URL-driven state.
 */
export function TripsTabs({ tab }: { tab: "active" | "all" }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function onValueChange(next: string) {
    if (next === tab) return
    startTransition(() => router.push(next === "all" ? "/trips?tab=all" : "/trips"))
  }

  return (
    <Tabs value={tab} onValueChange={onValueChange}>
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="all">All trips</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
