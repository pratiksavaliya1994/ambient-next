"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type RequestTab = "active" | "all"

/**
 * `/requests`' two tabs. The tab lives in the URL (`?tab=all`) so only the
 * tab on screen is fetched and a link or refresh lands on the same one; this
 * just navigates. `shown` flips the instant a tab is pressed rather than
 * waiting on the navigation — the page keys this by `tab`, so it remounts
 * in step with the URL and needs no effect to resync.
 */
export function RequestTabs({ tab }: { tab: RequestTab }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [shown, setShown] = useState(tab)

  return (
    <Tabs
      value={shown}
      onValueChange={(next: RequestTab) => {
        setShown(next)
        startTransition(() => router.push(next === "all" ? "/requests?tab=all" : "/requests"))
      }}
    >
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="all">All requests</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
