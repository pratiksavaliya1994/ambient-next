import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { MaterialItemCreateForm } from "@/components/material-item-form"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Add Material" }

/**
 * Adding a catalogue item. No reads: the one lookup this page needs — whether
 * the name is taken — needs the name, so it runs from the form as a server
 * action.
 */
export default function NewMaterialPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium">Add a material</h1>
          <p className="text-sm text-muted-foreground">
            A kind of thing the warehouse stocks and counts in units — not one delivery of it.
          </p>
        </div>
        <Link
          href="/materials"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          <ArrowLeftIcon />
          Back to materials
        </Link>
      </div>

      <Card data-size="sm">
        <CardHeader>
          <CardTitle className="text-base">New material</CardTitle>
          <span className="text-sm text-muted-foreground">
            Stock changes after this go through its page, so each one is recorded.
          </span>
        </CardHeader>
        <CardContent>
          <MaterialItemCreateForm />
        </CardContent>
      </Card>
    </div>
  )
}
