"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircleIcon, PlusIcon, SendIcon } from "lucide-react"

import { createPickupRequestAction, fetchToolsForJobAction } from "@/app/(app)/requests/new/pickup/actions"
import { INITIAL_CREATE_STATE, type CreateRequestState } from "@/app/(app)/requests/action-state"
import { DatePicker } from "@/components/date-picker"
import { MaterialDialog } from "@/components/material-dialog"
import {
  toolIdsOfPickup,
  changedConditionLines,
  PickupToolPicker,
  selectionOfTools,
  toolLinesOfPickup,
  type PickupSelection,
} from "@/components/pickup-tool-picker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { newYorkToday } from "@/lib/bubble/dates"
import { DEFAULT_WE_ARE, UNFILTERED_TO_DO, TO_DO, WE_ARE } from "@/lib/bubble/enums"
import type { PickupTool } from "@/lib/bubble/pickup-tools"
import {
  defaultMaterialsFor,
  Job,
  type FieldPm,
  type MaterialDefault,
  type TimeSlot,
} from "@/lib/bubble/reference-types"
import { pickupRequestFormSchema, type PickupRequestFormValues } from "@/lib/schemas/pickup-request"

/**
 * The Pickup counterpart to `RequestForm` — same two-column shell, three real
 * differences: a single date instead of a range, individual physical tools
 * (checkbox, always quantity 1, fetched live per job from Bubble's `tools`
 * table) instead of the `toolstype` catalogue, and a "Cleanup the Site"
 * toggle that auto-selects (but doesn't lock) all of a job's tools.
 */
export function PickupRequestForm({
  jobs,
  fieldPms,
  timeSlots,
  materialDefaults,
}: {
  jobs: Job[]
  fieldPms: FieldPm[]
  timeSlots: TimeSlot[]
  materialDefaults: MaterialDefault[]
}) {
  const router = useRouter()
  const [state, setState] = useState<CreateRequestState>(INITIAL_CREATE_STATE)
  const [pending, startTransition] = useTransition()
  const [toolsPending, startToolsTransition] = useTransition()

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isValid },
  } = useForm<PickupRequestFormValues>({
    resolver: zodResolver(pickupRequestFormSchema),
    defaultValues: {
      jobId: "",
      toDo: UNFILTERED_TO_DO,
      weAre: DEFAULT_WE_ARE,
      date: newYorkToday(),
      timeRange: timeSlots[2]?.label ?? "Anytime",
      slotHour: timeSlots[2]?.hour ?? 8,
      floor: "",
      contact: "",
      contactPhone: "",
      fieldPm: fieldPms[0]?.name ?? "",
      notes: "",
      toolsNotes: "",
      materials: "",
      tentative: false,
      cleanup: false,
      tools: [],
      toolIds: [],
      toolConditionUpdates: [],
    },
  })

  const date = useWatch({ control, name: "date" })
  const materials = useWatch({ control, name: "materials" })
  const toDo = useWatch({ control, name: "toDo" })

  const [job, setJob] = useState<Job | null>(null)
  const [selectedTools, setSelectedTools] = useState<Map<string, PickupSelection>>(new Map())
  const [toolsForJob, setToolsForJob] = useState<PickupTool[]>([])

  // `job` and the tool selection live outside react-hook-form for the same
  // reason as the Delivery form: their widgets need more than the one schema
  // field each maps onto.
  function updateJob(next: Job | null) {
    setJob(next)
    // A new job means a different set of tools entirely — the previous
    // job's picks and fetched list can't carry over.
    setSelectedTools(new Map())
    setValue("tools", [])
    setValue("toolIds", [])
    setValue("toolConditionUpdates", [])
    setValue("cleanup", false)
    setToolsForJob([])
    // Only `jobId` is validated here. The schema's "a tool or materials" rule
    // hangs off `tools`, so validating that field on job select would flag the
    // empty picker before the user has had any chance to fill it — the job is
    // set last so this pass sees the cleared tools in `isValid`.
    clearErrors("tools")
    setValue("jobId", next?.id ?? "", { shouldValidate: true })
    // The picker is inline now, so there is no dialog-open moment to fetch on.
    if (next) void loadToolsForJob(next)
  }

  function updateSelected(next: Map<string, PickupSelection>) {
    setSelectedTools(next)
    setValue("tools", toolLinesOfPickup(next), { shouldValidate: true })
    // Three projections of one selection, all set together so they can't drift:
    // names for the summary, ids for the `assignedtools` rows (3B — this is what
    // lets a trip collect them later), and the condition diff.
    setValue("toolIds", toolIdsOfPickup(next))
    setValue("toolConditionUpdates", changedConditionLines(next))
  }

  /**
   * Fetched on job select — and again from the Cleanup toggle only when that
   * load hasn't produced a list yet. Never cached across jobs, since which
   * tools are actually on site changes between visits (see
   * `lib/bubble/pickup-tools.ts`).
   */
  function loadToolsForJob(target: Job): Promise<PickupTool[]> {
    return new Promise((resolve) => {
      startToolsTransition(async () => {
        try {
          const fetched = await fetchToolsForJobAction(target.name)
          setToolsForJob(fetched)
          resolve(fetched)
        } catch (error) {
          toast.add({
            title: "Couldn't load tools",
            description: error instanceof Error ? error.message : "Try again.",
          })
          resolve([])
        }
      })
    })
  }

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createPickupRequestAction(values)
      if (result.status === "invalid") {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          setError(key as keyof PickupRequestFormValues, {
            type: "server",
            message,
          })
        }
      }
      setState(result)

      if (result.status === "created") {
        toast.add({
          title: "Pickup request created",
          description: `${result.job} is on the board.`,
        })
        router.push("/requests")
      }
    })
  })

  const slotItems = timeSlots.map((slot) => ({
    label: slot.label,
    value: slot.label,
  }))
  const pmItems = fieldPms.map((pm) => ({
    label: pm.company ? `${pm.name} — ${pm.company}` : pm.name,
    value: pm.name,
  }))

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {(state.status === "error" || state.status === "invalid") && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not create the request</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <Card>
          <CardHeader>
            <CardTitle>Pickup details</CardTitle>
            <CardDescription>Where the tools are coming from, when, and who to ask for on site.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field className="sm:col-span-2" data-invalid={errors.jobId ? true : undefined}>
                <FieldLabel htmlFor="job">
                  Job <span className="text-destructive">*</span>
                </FieldLabel>
                <Combobox
                  items={jobs}
                  value={job}
                  onValueChange={(next) => updateJob((next as Job) ?? null)}
                  itemToStringLabel={(item: Job) => item.name}
                  itemToStringValue={(item: Job) => item.id}
                  limit={40}
                >
                  <ComboboxInput
                    id="job"
                    placeholder="Search jobs by name"
                    aria-invalid={errors.jobId ? true : undefined}
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>No job matches.</ComboboxEmpty>
                    <ComboboxList>
                      {(item: Job) => (
                        <ComboboxItem key={item.id} value={item}>
                          <Item size="xs" className="p-0">
                            <ItemContent>
                              <ItemTitle className="whitespace-nowrap">{item.name}</ItemTitle>
                              <ItemDescription>
                                {[item.gc, item.borough, item.description].filter(Boolean).join(" · ") || "No GC Found"}
                              </ItemDescription>
                            </ItemContent>
                          </Item>
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                {job && <FieldDescription className="font-semibold">GC: {job.gc || "None on file"}</FieldDescription>}

                {errors.jobId && <FieldError errors={[errors.jobId]} />}
              </Field>

              <Field>
                <FieldLabel htmlFor="toDo">Job type</FieldLabel>
                <Controller
                  control={control}
                  name="toDo"
                  render={({ field }) => (
                    <Select
                      items={TO_DO.map((value) => ({ label: value, value }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="toDo" onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {TO_DO.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>Sets the default materials list.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="floor">Floor</FieldLabel>
                <Input id="floor" placeholder="Enter floor" {...register("floor")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="contact">Site contact</FieldLabel>
                <Input id="contact" placeholder="Enter contact name" {...register("contact")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="contactPhone">Contact phone</FieldLabel>
                <Input
                  id="contactPhone"
                  inputMode="tel"
                  placeholder="Enter phone number"
                  {...register("contactPhone")}
                />
              </Field>

              <Field data-invalid={errors.date ? true : undefined}>
                <FieldLabel htmlFor="date">
                  Pickup date <span className="text-destructive">*</span>
                </FieldLabel>
                <DatePicker
                  id="date"
                  value={date}
                  onValueChange={(next) => setValue("date", next, { shouldValidate: true })}
                  invalid={errors.date ? true : undefined}
                />
                {errors.date && <FieldError errors={[errors.date]} />}
              </Field>

              <Field>
                <FieldLabel htmlFor="slot">Time slot</FieldLabel>
                <Controller
                  control={control}
                  name="timeRange"
                  render={({ field }) => (
                    <Select
                      items={slotItems}
                      value={field.value}
                      onValueChange={(next) => {
                        field.onChange(next)
                        const hour = timeSlots.find((slot) => slot.label === next)?.hour
                        if (hour !== undefined) setValue("slotHour", hour)
                      }}
                    >
                      <SelectTrigger id="slot" onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {slotItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>Time slot for the pickup</FieldDescription>
              </Field>

              <Field orientation="horizontal">
                <Controller
                  control={control}
                  name="tentative"
                  render={({ field }) => (
                    <Switch
                      id="tentative"
                      checked={field.value}
                      onCheckedChange={(next) => field.onChange(next === true)}
                    />
                  )}
                />
                <FieldLabel htmlFor="tentative">Tentative — the date may still move</FieldLabel>
              </Field>

              <Field orientation="horizontal">
                <Controller
                  control={control}
                  name="cleanup"
                  render={({ field }) => (
                    <Switch
                      id="cleanup"
                      checked={field.value}
                      disabled={!job}
                      onCheckedChange={(next) => {
                        const checked = next === true
                        field.onChange(checked)
                        if (!checked || !job) return
                        if (toolsForJob.length > 0) {
                          // The job-select fetch already landed — select what is
                          // on screen instead of reloading the same list.
                          updateSelected(selectionOfTools(toolsForJob))
                          return
                        }
                        // Nothing loaded yet (toggled while the job-select fetch
                        // was still in flight, or it came back empty) — fetch so
                        // the toggle can't select an empty list.
                        void loadToolsForJob(job).then((fetched) => updateSelected(selectionOfTools(fetched)))
                      }}
                    />
                  )}
                />
                <FieldLabel htmlFor="cleanup">Cleanup the Site — take everything on file</FieldLabel>
              </Field>

              <Field>
                <FieldLabel htmlFor="weAre">We are</FieldLabel>
                <Controller
                  control={control}
                  name="weAre"
                  render={({ field }) => (
                    <Select
                      items={WE_ARE.map((value) => ({ label: value, value }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="weAre" onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {WE_ARE.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="fieldPm">Field PM</FieldLabel>
                <Controller
                  control={control}
                  name="fieldPm"
                  render={({ field }) => (
                    <Select items={pmItems} value={field.value} onValueChange={(next) => field.onChange(String(next))}>
                      <SelectTrigger id="fieldPm" onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {pmItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="notes">Notes</FieldLabel>
                <Textarea id="notes" rows={2} placeholder="Add notes" {...register("notes")} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-18">
          <CardHeader>
            <CardTitle>
              Tools <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              {!job
                ? "Pick a job to see its tools."
                : toolsPending
                  ? "Loading tools…"
                  : `${selectedTools.size} of ${toolsForJob.length} selected`}
            </CardDescription>
            <CardAction className="flex items-center gap-1">
              {selectedTools.size > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => updateSelected(new Map())}>
                  Clear all
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={toolsForJob.length === 0 || selectedTools.size === toolsForJob.length}
                onClick={() => updateSelected(selectionOfTools(toolsForJob))}
              >
                Select all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-6">
              <Field data-invalid={errors.tools ? true : undefined}>
                <PickupToolPicker
                  tools={toolsForJob}
                  loading={toolsPending}
                  hasJob={job !== null}
                  selected={selectedTools}
                  onChange={updateSelected}
                />
                {errors.tools && <FieldError errors={[errors.tools]} />}
              </Field>

              <Field>
                <div className="flex items-center justify-between py-2">
                  <FieldLabel>Materials</FieldLabel>
                  <div className="flex items-center gap-2">
                    {materials.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setValue("materials", "", { shouldValidate: true })}
                      >
                        Clear
                      </Button>
                    )}
                    <MaterialDialog
                      value={materials}
                      defaultText={defaultMaterialsFor(materialDefaults, toDo)}
                      onChange={(next) => setValue("materials", next, { shouldValidate: true })}
                      trigger={
                        <Button type="button" variant="outline" size="sm">
                          <PlusIcon data-icon="inline-start" />
                          Add material
                        </Button>
                      }
                    />
                  </div>
                </div>
                {materials.trim() ? (
                  <pre className="min-h-32 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                    {materials}
                  </pre>
                ) : (
                  <FieldDescription>No materials added.</FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="toolsNotes">Tool notes</FieldLabel>
                <Textarea
                  id="toolsNotes"
                  rows={2}
                  placeholder="Anything the warehouse needs to know"
                  {...register("toolsNotes")}
                />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Button type="submit" disabled={!isValid || pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
              Create pickup request
            </Button>
          </CardFooter>
        </Card>
      </div>
    </form>
  )
}
