"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircleIcon, PlusIcon, SendIcon } from "lucide-react"

import {
  createRequestAction,
  INITIAL_CREATE_STATE,
} from "@/app/(app)/requests/actions"
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
  type ToDo,
  type WeAre,
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
import { requestFormSchema } from "@/lib/schemas/request"

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
  notificationsOn,
}: {
  jobs: Job[]
  toolTypes: ToolType[]
  fieldPms: FieldPm[]
  timeSlots: TimeSlot[]
  notificationsOn: boolean
}) {
  const router = useRouter()
  const [state, submit, pending] = useActionState(
    createRequestAction,
    INITIAL_CREATE_STATE
  )

  const [job, setJob] = useState<Job | null>(null)
  const [toDo, setToDo] = useState<ToDo>(UNFILTERED_TO_DO)
  const [weAre, setWeAre] = useState<WeAre>(DEFAULT_WE_ARE)
  const [movement, setMovement] = useState<Movement>("delivery")
  const [day, setDay] = useState(newYorkToday)
  const [slotHour, setSlotHour] = useState(timeSlots[2]?.hour ?? 8)
  const [timeRange, setTimeRange] = useState("Anytime")
  const [floor, setFloor] = useState("")
  const [contact, setContact] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [fieldPm, setFieldPm] = useState(fieldPms[0]?.name ?? "")
  const [notes, setNotes] = useState("")
  const [toolsNotes, setToolsNotes] = useState("")
  const [tentative, setTentative] = useState(false)
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

  const chosenMovement =
    MOVEMENTS.find((item) => item.value === movement) ?? MOVEMENTS[0]

  const values = {
    jobId: job?.id ?? "",
    toDo,
    weAre,
    delivery: chosenMovement.delivery,
    pickup: chosenMovement.pickup,
    day,
    slotHour,
    timeRange,
    floor,
    contact,
    contactPhone,
    fieldPm,
    notes,
    toolsNotes,
    tentative,
    tools,
  }

  // The same schema the action runs, so the button state matches the outcome.
  const valid = requestFormSchema.safeParse(values).success
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {}

  useEffect(() => {
    if (state.status !== "created") return

    toast.add({
      title: "Request created",
      description: state.warning ?? `${state.job} is on the board.`,
    })
    router.push("/requests")
  }, [state, router])

  const slotItems = timeSlots.map((slot) => ({
    label: slot.label,
    value: String(slot.hour),
  }))
  const pmItems = fieldPms.map((pm) => ({
    label: pm.company ? `${pm.name} — ${pm.company}` : pm.name,
    value: pm.name,
  }))
  const units = tools.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <form action={submit} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={JSON.stringify(values)} />

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
          if (next[0]) setMovement(next[0] as Movement)
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
      {fieldErrors.delivery && <FieldError>{fieldErrors.delivery}</FieldError>}

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
                data-invalid={fieldErrors.jobId ? true : undefined}
              >
                <FieldLabel htmlFor="job">Job</FieldLabel>
                <Combobox
                  items={jobs}
                  value={job}
                  onValueChange={(next) => setJob((next as Job) ?? null)}
                  itemToStringLabel={(item: Job) => item.name}
                  itemToStringValue={(item: Job) => item.id}
                  limit={40}
                >
                  <ComboboxInput
                    id="job"
                    placeholder="Search jobs by name"
                    aria-invalid={fieldErrors.jobId ? true : undefined}
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
                {fieldErrors.jobId && (
                  <FieldError>{fieldErrors.jobId}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="toDo">Job type</FieldLabel>
                <Select
                  items={TO_DO.map((value) => ({ label: value, value }))}
                  value={toDo}
                  onValueChange={(next) => setToDo(next as ToDo)}
                >
                  <SelectTrigger id="toDo">
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
                <FieldDescription>Filters the tool list.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="weAre">We are</FieldLabel>
                <Select
                  items={WE_ARE.map((value) => ({ label: value, value }))}
                  value={weAre}
                  onValueChange={(next) => setWeAre(next as WeAre)}
                >
                  <SelectTrigger id="weAre">
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
              </Field>

              <Field>
                <FieldLabel htmlFor="floor">Floor</FieldLabel>
                <Input
                  id="floor"
                  value={floor}
                  onChange={(event) => setFloor(event.target.value)}
                  placeholder="14, ground, loading dock"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="contact">Site contact</FieldLabel>
                <Input
                  id="contact"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="contactPhone">Contact phone</FieldLabel>
                <Input
                  id="contactPhone"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  inputMode="tel"
                />
              </Field>

              <Field data-invalid={fieldErrors.day ? true : undefined}>
                <FieldLabel htmlFor="day">Date</FieldLabel>
                <DatePicker
                  id="day"
                  value={day}
                  onValueChange={setDay}
                  invalid={fieldErrors.day ? true : undefined}
                />
                {/* <FieldDescription>New York time.</FieldDescription> */}
              </Field>

              <Field>
                <FieldLabel htmlFor="slot">Calendar slot</FieldLabel>
                <Select
                  items={slotItems}
                  value={String(slotHour)}
                  onValueChange={(next) => setSlotHour(Number(next))}
                >
                  <SelectTrigger id="slot">
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
              </Field>

              <Field>
                <FieldLabel htmlFor="timeRange">Time range</FieldLabel>
                <Input
                  id="timeRange"
                  value={timeRange}
                  onChange={(event) => setTimeRange(event.target.value)}
                  placeholder="Anytime"
                />
              </Field>

              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="fieldPm">Field PM</FieldLabel>
                <Select
                  items={pmItems}
                  value={fieldPm}
                  onValueChange={(next) => setFieldPm(String(next))}
                >
                  <SelectTrigger id="fieldPm">
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
                <FieldDescription>
                  Saved to fieldPM2, the text field the live app reads.
                </FieldDescription>
              </Field>

              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="notes">Notes</FieldLabel>
                <Textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>

              <Field orientation="horizontal" className="sm:col-span-2">
                <Switch
                  id="tentative"
                  checked={tentative}
                  onCheckedChange={(next) => setTentative(next === true)}
                />
                <FieldLabel htmlFor="tentative">
                  Tentative — the date may still move
                </FieldLabel>
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
                onChange={setSelected}
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
              <Field data-invalid={fieldErrors.tools ? true : undefined}>
                <SelectedTools selected={selected} onChange={setSelected} />
                {fieldErrors.tools && (
                  <FieldError>{fieldErrors.tools}</FieldError>
                )}
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
                  value={toolsNotes}
                  onChange={(event) => setToolsNotes(event.target.value)}
                  placeholder="Anything the warehouse needs to know"
                />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Button type="submit" disabled={!valid || pending}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SendIcon data-icon="inline-start" />
              )}
              Create request
            </Button>
            <p className="text-xs text-muted-foreground">
              {notificationsOn
                ? "A WhatsApp notification will go out."
                : "WhatsApp notifications are off — nothing will be sent."}
            </p>
          </CardFooter>
        </Card>
      </div>
    </form>
  )
}
