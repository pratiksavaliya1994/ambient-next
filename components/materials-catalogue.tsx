"use client"

import { PackageIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { MaterialCatalogueCard } from "@/components/material-catalogue-card"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { MaterialItem } from "@/lib/bubble/material-items-types"

const ALL_CATEGORIES = "__all__"

/**
 * `/materials`' one client island: search by name, a category filter and a
 * "show retired" toggle over the catalogue the page read.
 *
 * Filters live, per keystroke — unlike the tools list, nothing here goes back
 * to Bubble, so there's no round trip to save by waiting for a Search press.
 */
export function MaterialsCatalogue({ items }: { items: MaterialItem[] }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const [showRetired, setShowRetired] = useState(false)

  const categories = useMemo(
    () => [...new Set(items.flatMap((item) => (item.category ? [item.category] : [])))].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter(
      (item) =>
        (showRetired || item.active) &&
        (category === ALL_CATEGORIES || item.category === category) &&
        (!needle || item.name.toLowerCase().includes(needle))
    )
  }, [items, query, category, showRetired])

  if (items.length === 0) return <NoMaterialsYet />

  return (
    <div className="flex flex-col gap-3">
      <CatalogueFilters
        query={query}
        onQueryChange={setQuery}
        categories={categories}
        category={category}
        onCategoryChange={setCategory}
        showRetired={showRetired}
        onShowRetiredChange={setShowRetired}
      />

      <p className="text-sm text-muted-foreground">
        {visible.length} {visible.length === 1 ? "material" : "materials"}
      </p>

      {visible.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyTitle>No materials match</EmptyTitle>
            <EmptyDescription>Try a different search or category{showRetired ? "" : ", or show retired items"}.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <MaterialCatalogueCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function CatalogueFilters({
  query,
  onQueryChange,
  categories,
  category,
  onCategoryChange,
  showRetired,
  onShowRetiredChange,
}: {
  query: string
  onQueryChange: (next: string) => void
  categories: string[]
  category: string
  onCategoryChange: (next: string) => void
  showRetired: boolean
  onShowRetiredChange: (next: boolean) => void
}) {
  const categoryItems = [
    { label: "All categories", value: ALL_CATEGORIES },
    ...categories.map((value) => ({ label: value, value })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="max-w-sm min-w-0">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search materials…"
        />
        {query && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onQueryChange("")}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <Select items={categoryItems} value={category} onValueChange={(next) => onCategoryChange(next ?? ALL_CATEGORIES)}>
        <SelectTrigger aria-label="Category" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-fit min-w-(--anchor-width)">
          <SelectGroup>
            {categoryItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Field orientation="horizontal" className="w-auto">
        <Switch id="showRetired" checked={showRetired} onCheckedChange={(next) => onShowRetiredChange(next === true)} />
        <FieldLabel htmlFor="showRetired">Show retired</FieldLabel>
      </Field>
    </div>
  )
}

function NoMaterialsYet() {
  return (
    <Empty className="border border-dashed py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageIcon />
        </EmptyMedia>
        <EmptyTitle>No materials yet</EmptyTitle>
        <EmptyDescription>Add the first item the warehouse stocks, with how many are on the shelf.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/materials/new" className={buttonVariants({ size: "sm" })}>
          <PlusIcon />
          Add material
        </Link>
      </EmptyContent>
    </Empty>
  )
}
