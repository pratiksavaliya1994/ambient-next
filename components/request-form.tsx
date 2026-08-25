"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircleIcon, PlusIcon, SendIcon } from "lucide-react"

import {
  INITIAL_CREATE_STATE,
  type CreateRequestState,
} from "@/app/(app)/requests/action-state"
import { createRequestAction } from "@/app/(app)/requests/actions"
import { DatePicker } from "@/components/date-picker"
import {
  SelectedTools,
  ToolPickerDialog,
  toolLinesOf,
} from "@/components/tool-picker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { newYorkToday } from "@/lib/bubble/dates"
import {
  DEFAULT_WE_ARE,
  TO_DO,
  UNFILTERED_TO_DO,
  WE_ARE,
} from "@/lib/bubble/enums"
import {
  Job,
  toolTypesFor,
  type FieldPm,
  // type JobOption,
  type TimeSlot,
  type ToolType,
} from "@/lib/bubble/reference-types"
import { formatToolsSummary } from "@/lib/bubble/tools-summary"
import {
  requestFormSchema,
  type RequestFormValues,
} from "@/lib/schemas/request"

/**
 * `delivery` and `pickup` are two independent yes/no fields in Bubble and both
 * can be true, but as two checkboxes they read as an invalid-by-default state
 * — untick both and the form breaks. As three mutually exclusive tabs the same
 * three combinations are reachable and none of them is empty, so the
 * "pick delivery, pickup, or both" error can no longer be provoked from here.
 */
const MOVEMENTS = [
  { value: "delivery", label: "Delivery", delivery: true, pickup: false },
  { value: "pickup", label: "Pickup", delivery: false, pickup: true },
  { value: "both", label: "Both", delivery: true, pickup: true },
] as const

type Movement = (typeof MOVEMENTS)[number]["value"]

/**
 * The whole request form as one client island.
 *
 * The Bubble schema has no draft state — a request either exists or it does
 * not — so everything here stays in browser state until the submit button, and
 * the server action writes both rows in one go. Abandoning the page leaves the
 * database untouched, which is the opposite of what the old Bubble UI does.
 *
 * Laid out as one form column beside a tool column rather than as three
 * stacked cards. Two fields to a row and the 112-row catalogue moved into a
 * dialog, so the fields a PM actually fills in fit on one screen; what stays
 * beside them is the selection, not the catalogue. Below `lg` the columns
 * stack, tools last.
 */
export function RequestForm({
  jobs,
  toolTypes,
  fieldPms,
  timeSlots,
}: {
  jobs: Job[]
  toolTypes: ToolType[]
  fieldPms: FieldPm[]
  timeSlots: TimeSlot[]
}) {
  const router = useRouter()
  const [state, setState] = useState<CreateRequestState>(INITIAL_CREATE_STATE)
  const [pending, startTransition] = useTransition()

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    trigger,
    formState: { errors, isValid },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      jobId: "",
      toDo: UNFILTERED_TO_DO,
      weAre: DEFAULT_WE_ARE,
      delivery: true,
      pickup: false,
      startDate: newYorkToday(),
      endDate: newYorkToday(),
      timeRange: timeSlots[2]?.label ?? "Anytime",
      slotHour: timeSlots[2]?.hour ?? 8,
      floor: "",
      contact: "",
      contactPhone: "",
      fieldPm: fieldPms[0]?.name ?? "",
      notes: "",
      toolsNotes: "",
      tentative: false,
      tools: [],
    },
  })

  const toDo = useWatch({ control, name: "toDo" })

  const [job, setJob] = useState<Job | null>(null)
  const [movement, setMovement] = useState<Movement>("delivery")
  const [selected, setSelected] = useState<Record<string, number>>({})

  const tools = useMemo(() => toolLinesOf(selected), [selected])

  // The job type filters the catalogue, so switching it can strand a tool that
  // is no longer offered. Stranded picks stay selected on purpose — dropping
  // someone's choices silently because they changed a dropdown is worse than
  // showing them a list that no longer matches.
  const offered = useMemo(
    () => toolTypesFor(toolTypes, toDo),
    [toolTypes, toDo]
  )

  // `job`, `movement` and `selected` live outside react-hook-form because the
  // widgets that edit them (Combobox, ToggleGroup, the tool picker) need more
  // than the one schema field each maps onto — the Job object for display, or
  // two booleans from one three-way toggle. Their `onChange` handlers push the
  // derived schema value into the form; `shouldValidate` only re-checks the
  // field being set, so picking a job doesn't prematurely flag the tools list.
  function updateJob(next: Job | null) {
    setJob(next)
    setValue("jobId", next?.id ?? "", { shouldValidate: true })
  }

  function updateMovement(next: Movement) {
    setMovement(next)
    const chosen = MOVEMENTS.find((item) => item.value === next) ?? MOVEMENTS[0]
    // Both fields have to change before either is re-validated: the
    // delivery-or-pickup rule is cross-field, so validating `delivery` alone
    // right after setting it (with the old `pickup` still in place) can flag
    // an error that a lone, later `pickup` validation pass never clears.
    setValue("delivery", chosen.delivery)
    setValue("pickup", chosen.pickup)
    void trigger(["delivery", "pickup"])
  }

  function updateSelected(next: Record<string, number>) {
    setSelected(next)
    setValue("tools", toolLinesOf(next), { shouldValidate: true })
  }

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createRequestAction(values)
      if (result.status === "invalid") {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          setError(key as keyof RequestFormValues, {
            type: "server",
            message,
          })
        }
      }
      setState(result)

      if (result.status === "created") {
        toast.add({
          title: "Request created",
          description: `${result.job} is on the board.`,
        })
        router.push("/requests")
      }
    })
  })

  // Keyed by label rather than `slot.hour`: `timeRange` — the Bubble field
  // this now writes to — is that label text verbatim, and several slots
  // (e.g. the two halves of 6am) share the same starting hour.
  const slotItems = timeSlots.map((slot) => ({
    label: slot.label,
    value: slot.label,
  }))
  const pmItems = fieldPms.map((pm) => ({
    label: pm.company ? `${pm.name} — ${pm.company}` : pm.name,
    value: pm.name,
  }))
  const units = tools.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {(state.status === "error" || state.status === "invalid") && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not create the request</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <ToggleGroup
        value={[movement]}
        onValueChange={(next) => {
          if (next[0]) updateMovement(next[0] as Movement)
        }}
        spacing={0}
        variant="outline"
        className="w-full *:flex-1"
        aria-label="Request type"
      >
        {MOVEMENTS.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value}>
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {errors.delivery && <FieldError errors={[errors.delivery]} />}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Request details</CardTitle>
            <CardDescription>
              Where the tools are going, when they are needed, and who to ask
              for on site.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                className="sm:col-span-2"
                data-invalid={errors.jobId ? true : undefined}
              >
                <FieldLabel htmlFor="job">Job</FieldLabel>
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
                              <ItemTitle className="whitespace-nowrap">
                                {item.name}
                              </ItemTitle>
                              <ItemDescription>
                                {[item.gc, item.borough, item.description]
                                  .filter(Boolean)
                                  .join(" · ") || "No GC on file"}
                              </ItemDescription>
                            </ItemContent>
                          </Item>
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
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
                <FieldDescription>Filters the tool list.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="floor">Floor</FieldLabel>
                <Input
                  id="floor"
                  placeholder="14, ground, loading dock"
                  {...register("floor")}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="contact">Site contact</FieldLabel>
                <Input id="contact" {...register("contact")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="contactPhone">Contact phone</FieldLabel>
                <Input
                  id="contactPhone"
                  inputMode="tel"
                  {...register("contactPhone")}
                />
              </Field>

              <Field data-invalid={errors.startDate ? true : undefined}>
                <FieldLabel htmlFor="startDate">Start date</FieldLabel>
                <Controller
                  control={control}
                  name="startDate"
                  render={({ field }) => (
                    <DatePicker
                      id="startDate"
                      value={field.value}
                      onValueChange={field.onChange}
                      invalid={errors.startDate ? true : undefined}
                    />
                  )}
                />
                {errors.startDate && <FieldError errors={[errors.startDate]} />}
              </Field>

              <Field data-invalid={errors.endDate ? true : undefined}>
                <FieldLabel htmlFor="endDate">End date</FieldLabel>
                <Controller
                  control={control}
                  name="endDate"
                  render={({ field }) => (
                    <DatePicker
                      id="endDate"
                      value={field.value}
                      onValueChange={field.onChange}
                      invalid={errors.endDate ? true : undefined}
                    />
                  )}
                />
                {errors.endDate && <FieldError errors={[errors.endDate]} />}
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
                        const hour = timeSlots.find(
                          (slot) => slot.label === next
                        )?.hour
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
                <FieldDescription>
                  Saved to Bubble as timeRange.
                </FieldDescription>
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
                <FieldLabel htmlFor="tentative">
                  Tentative — the date may still move
                </FieldLabel>
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
                    <Select
                      items={pmItems}
                      value={field.value}
                      onValueChange={(next) => field.onChange(String(next))}
                    >
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
                <FieldDescription>
                  Saved to fieldPM2, the text field the live app reads.
                </FieldDescription>
              </Field>

              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="notes">Notes</FieldLabel>
                <Textarea id="notes" rows={2} {...register("notes")} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-18">
          <CardHeader>
            <CardTitle>Tools</CardTitle>
            <CardDescription>
              {tools.length === 0
                ? `${offered.length} offered for ${toDo}`
                : `${tools.length} ${tools.length === 1 ? "type" : "types"}, ${units} in total`}
            </CardDescription>
            <CardAction>
              <ToolPickerDialog
                toolTypes={offered}
                selected={selected}
                onChange={updateSelected}
                toDo={toDo}
                catalogueSize={toolTypes.length}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <PlusIcon data-icon="inline-start" />
                    Add tools
                  </Button>
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-4">
              <Field data-invalid={errors.tools ? true : undefined}>
                <SelectedTools selected={selected} onChange={updateSelected} />
                {errors.tools && <FieldError errors={[errors.tools]} />}
              </Field>

              {tools.length > 0 && (
                <Field>
                  <FieldLabel>Saved to Bubble as</FieldLabel>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
                    {formatToolsSummary(tools)}
                  </pre>
                </Field>
              )}

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
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SendIcon data-icon="inline-start" />
              )}
              Create request
            </Button>
            <p className="text-xs text-muted-foreground">
              A WhatsApp notification goes out automatically.
            </p>
          </CardFooter>
        </Card>
      </div>
    </form>
  )
}
