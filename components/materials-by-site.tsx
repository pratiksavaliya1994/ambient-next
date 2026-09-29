"use client"

import { MapPinIcon, SearchIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { SiteStockCard } from "@/components/site-stock-card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import type { SiteGroup } from "@/lib/bubble/site-stock-types"

/**
 * `/materials/sites`' one client island: a card per job site, the newest
 * movement first, and a search over site and item names.
 *
 * Filters in the browser, as the Job Dashboard does — the page already read
 * every site row, so a keystroke costs no round trip. A site-name match keeps
 * the whole card; an item-name match keeps only the matching lines.
 */
export function MaterialsBySite({
  groups,
  jobIds,
}: {
  groups: SiteGroup[]
  /** `location → jobs._id`, for the card links. A site missing here renders unlinked. */
  jobIds: Record<string, string>
}) {
  const [query, setQuery] = useState("")

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return groups
    return groups
      .map((group) => {
        if (group.location.toLowerCase().includes(needle)) return group
        const items = group.items.filter((item) => item.materialName.toLowerCase().includes(needle))
        return items.length > 0 ? { ...group, items } : null
      })
      .filter((group): group is SiteGroup => group !== null)
  }, [groups, query])

  if (groups.length === 0) {
    return (
      <Empty className="border border-dashed py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing has been delivered to a site yet</EmptyTitle>
          <EmptyDescription>Once a trip drops stock at a job, that site shows up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <InputGroup className="max-w-sm min-w-0">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sites or materials…"
        />
        {query && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQuery("")}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <p className="text-sm text-muted-foreground">
        {visible.length} {visible.length === 1 ? "site" : "sites"}
      </p>

      {visible.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyTitle>No sites match</EmptyTitle>
            <EmptyDescription>No site or material name matches that search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="columns-3xs gap-1.5">
          {visible.map((group) => (
            <div key={group.location} className="mb-1.5 break-inside-avoid">
              <SiteStockCard group={group} jobId={jobIds[group.location]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
