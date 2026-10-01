"use client"

import { use, useState } from "react"
import { MapPinPlusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import type { StopJob } from "@/lib/bubble/reference-types"

/**
 * Adds a stop to the route by hand — a job the driver has to visit that no
 * picked tool or material needs yet.
 *
 * Only jobs on file can be picked: the stop's `location` is a `jobs.name`, the
 * same string `tools.location` and `request.job` hold, so a tool assigned to
 * that job later lands in this stop rather than beside it (`withManualStops`).
 * The server checks the name against `jobs` again before saving.
 */
export function TripAddStopDialog({
  jobs,
  taken,
  disabled,
  onAdd,
}: {
  /** Unwrapped here; the caller wraps this in `Suspense`. */
  jobs: Promise<StopJob[]>
  /** Job names already added by hand — not offered twice. */
  taken: ReadonlySet<string>
  disabled: boolean
  onAdd: (location: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [job, setJob] = useState<StopJob | null>(null)
  const available = use(jobs).filter((entry) => !taken.has(entry.name))

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) setJob(null)
  }

  function add() {
    if (!job) return
    onAdd(job.name)
    changeOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled}>
            <MapPinPlusIcon />
            Add stop
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a stop</DialogTitle>
          <DialogDescription>
            A job the driver has to visit, with or without anything to carry. Tools and materials for this job that
            you pick later land in this stop.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="trip-add-stop-job">Job</FieldLabel>
          <Combobox
            items={available}
            value={job}
            onValueChange={(next) => setJob((next as StopJob) ?? null)}
            itemToStringLabel={(item: StopJob) => item.name}
            itemToStringValue={(item: StopJob) => item.id}
            limit={40}
          >
            <ComboboxInput id="trip-add-stop-job" placeholder="Search jobs by name" />
            <ComboboxContent>
              <ComboboxEmpty>No job matches.</ComboboxEmpty>
              <ComboboxList>
                {(item: StopJob) => (
                  <ComboboxItem key={item.id} value={item}>
                    <Item size="xs" className="p-0">
                      <ItemContent>
                        <ItemTitle className="whitespace-nowrap">{item.name}</ItemTitle>
                        <ItemDescription>{[item.gc, item.borough].filter(Boolean).join(" · ") || "No GC Found"}</ItemDescription>
                      </ItemContent>
                    </Item>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>It goes to the end of the route. Drag it to where it belongs.</FieldDescription>
        </Field>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={add} disabled={!job}>
            <PlusIcon />
            Add stop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
