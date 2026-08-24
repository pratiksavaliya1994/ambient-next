"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircleIcon, SendIcon } from "lucide-react"

import {
  createRequestAction,
  INITIAL_CREATE_STATE,
} from "@/app/(app)/requests/actions"
import { ToolPicker, toolLinesOf } from "@/components/tool-picker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  FieldLegend,
  FieldSet,
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
  toolTypesFor,
  type FieldPm,
  type JobOption,
  type TimeSlot,
  type ToolType,
} from "@/lib/bubble/reference-types"
import { formatToolsSummary } from "@/lib/bubble/tools-summary"
import { requestFormSchema } from "@/lib/schemas/request"

/**
 * The whole request form as one client island.
 *
 * The Bubble schema has no draft state — a request either exists or it does
 * not — so everything here stays in browser state until the submit button, and
 * the server action writes both rows in one go. Abandoning the page leaves the
 * database untouched, which is the opposite of what the old Bubble UI does.
 */
export function RequestForm({
  jobs,
  toolTypes,
  fieldPms,
  timeSlots,
  notificationsOn,
}: {
  jobs: JobOption[]
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

  const [job, setJob] = useState<JobOption | null>(null)
  const [toDo, setToDo] = useState<ToDo>(UNFILTERED_TO_DO)
  const [weAre, setWeAre] = useState<WeAre>(DEFAULT_WE_ARE)
  const [delivery, setDelivery] = useState(true)
  const [pickup, setPickup] = useState(false)
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

  const values = {
    jobId: job?.id ?? "",
    toDo,
    weAre,
    delivery,
    pickup,
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

  return (
    <form action={submit} className="flex flex-col gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(values)} />

      {(state.status === "error" || state.status === "invalid") && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not create the request</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Job</CardTitle>
          <CardDescription>
            Where the tools are going, and what the work is.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={fieldErrors.jobId ? true : undefined}>
              <FieldLabel htmlFor="job">Job</FieldLabel>
              <Combobox
                items={jobs}
                value={job}
                onValueChange={(next) => setJob((next as JobOption) ?? null)}
                itemToStringLabel={(item: JobOption) => item.name}
                itemToStringValue={(item: JobOption) => item.id}
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
                    {(item: JobOption) => (
                      <ComboboxItem key={item.id} value={item}>
                        <Item size="xs" className="p-0">
                          <ItemContent>
                            <ItemTitle className="whitespace-nowrap">
                              {item.name}
                            </ItemTitle>
                            <ItemDescription>
                              {[item.gc, item.borough]
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
              <FieldDescription>
                Filters the tool list below. Fast Request shows everything.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>We are</FieldLabel>
              <ToggleGroup
                value={[weAre]}
                onValueChange={(next) => {
                  if (next[0]) setWeAre(next[0] as WeAre)
                }}
                spacing={2}
              >
                {WE_ARE.map((value) => (
                  <ToggleGroupItem key={value} value={value}>
                    {value}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <FieldSet data-invalid={fieldErrors.delivery ? true : undefined}>
              <FieldLegend variant="label">Movement</FieldLegend>
              <FieldGroup>
                <Field orientation="horizontal">
                  <Checkbox
                    id="delivery"
                    checked={delivery}
                    onCheckedChange={(next) => setDelivery(next === true)}
                  />
                  <FieldLabel htmlFor="delivery">Delivery</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="pickup"
                    checked={pickup}
                    onCheckedChange={(next) => setPickup(next === true)}
                  />
                  <FieldLabel htmlFor="pickup">Pickup</FieldLabel>
                </Field>
              </FieldGroup>
              {fieldErrors.delivery && (
                <FieldError>{fieldErrors.delivery}</FieldError>
              )}
            </FieldSet>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When and who</CardTitle>
          <CardDescription>
            The date and slot place the request on the Bubble calendar. The time
            range is the free-text note the drivers read.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={fieldErrors.day ? true : undefined}>
                <FieldLabel htmlFor="day">Date</FieldLabel>
                <Input
                  id="day"
                  type="date"
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                  aria-invalid={fieldErrors.day ? true : undefined}
                />
                <FieldDescription>New York time.</FieldDescription>
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
            </div>

            <Field>
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
                Saved to fieldPM2, the text field the live app reads. The
                matching option set is left empty, as it is on every recent row.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>

            <Field orientation="horizontal">
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

      <Card>
        <CardHeader>
          <CardTitle>Tools</CardTitle>
          <CardDescription>
            {offered.length} of {toolTypes.length} tool types are offered for{" "}
            {toDo}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={fieldErrors.tools ? true : undefined}>
              <ToolPicker
                toolTypes={offered}
                selected={selected}
                onChange={setSelected}
              />
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
                <FieldDescription>
                  One requestedtools row, one text field — the shape the old app
                  reads.
                </FieldDescription>
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
        <CardFooter className="justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {notificationsOn
              ? "A WhatsApp notification will go out."
              : "WhatsApp notifications are off — nothing will be sent."}
          </p>
          <Button type="submit" disabled={!valid || pending}>
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SendIcon data-icon="inline-start" />
            )}
            Create request
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
