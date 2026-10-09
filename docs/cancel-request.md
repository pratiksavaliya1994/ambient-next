# Cancel request

Built 2026-10-09. **No Bubble Studio change is required.** There is a short Bubble checklist in §4.

## 1. What it is

**Close request** ends a request that has partly happened. **Cancel request** is for a request that should never have existed, such as a stale one or one created by mistake. It works for both deliveries and pickups. It gives back everything the request held and ends the request at a new terminal status, `Cancelled`.

The button is on the request detail page only, next to Assign and Add to a trip. It appears only when both of these are true:

1. The status is `New` or `Assigned`. A blank legacy status reads as `New`, so old blank rows can be cancelled too.
2. No trip holds anything of the request's. Any one of these hides the button:
   - any assigned tool with a live claim on an open trip (`listToolClaims`);
   - any of the request's own material lines with a live trip row (`isLive`: `Planned` on an open trip, `Loaded` or `Refused`);
   - for a delivery, any pickup line feeding it as a transfer that has a live trip row.

"On a trip" is read from the trip rows, not from `tools.statusNew`. A tool planned onto a draft trip, or onto a started trip whose driver hasn't reached it yet, still reads `Assigned`.

`cancelRequestAction` re-checks everything from fresh reads, because a server action can be reached by a direct POST. The rules are in `lib/requests/cancel.ts`, and the page and the action share them.

User decisions:
- No notification.
- Optional reason.
- Detail page only.

## 2. What a cancel does, in order

Every step before step 4 can safely be repeated. If a step fails, the request stays open and pressing Cancel again picks up where it stopped.

1. **Transfer links** (`releaseTransfersForClose`, shared with Close).
   - Delivery: the pickup lines feeding it are unlinked and head for the warehouse instead.
   - Pickup: its own linked lines are unlinked, and the delivery on the other side is re-synced in step 6.
2. **Warehouse stock** (`releaseUnshippedStock`, moved out of Close so both use it). Each inventory line on a delivery is lowered to what was actually dropped, which is 0 here. The stock goes back on the shelf with history reason `Release`. Pickup lines hold no stock. Site stock is calculated (delivered minus collected), so it needs no change.
3. **Tools** (`planToolRelease`). Only a tool still reading `Assigned` or `Pickup Requested` is touched; any other status describes where the tool really is. For each tool, the other open requests holding it decide what happens:

   | Other open holders | New `statusNew` |
   | --- | --- |
   | Any delivery | left as it is (that delivery's commitment) |
   | Only pickups | `Pickup Requested` |
   | None, and the tool is at a warehouse (blank counts as a warehouse) | `Available` |
   | None, and the tool is on a job site | `Delivered` (the rule a trip drop and stock take use) |

   There is one `update-request-status` call per target status. Each call sends the request's current status, so the request itself doesn't change in this step. `location` and `currentUser` aren't sent, because a released tool hasn't moved. `lastEditedBy` is stamped from `actor` as on every other call.
4. **`request.status = "Cancelled"`** (`setRequestStatuses`).
5. **Note.** One line is appended to `request.notes`: `Cancelled 10-9-2026 2:30 pm by <name>: <reason>`. It is a plain Data API `PATCH`, done after a fresh read of the row. If the note fails, the person gets a warning, but the cancel has already happened.
6. **Re-sync** the requests on the other side of any transfer that was cleared.

The `assignedtools` rows are **kept as history**, as Close keeps them. Every read of "who holds this tool" filters by `isOpenRequest`, which now excludes `Cancelled`, so those rows hold nothing.

## 3. Keeping it cancelled

- `isOpenRequest` excludes `Cancelled`. That one change removes cancelled requests from the Active tab and its status filter, from request claims, transfer sources, site pickups and the material-assign guard.
- `deriveRequestStatus` is a one-way rule on `!isOpenRequest(current)`, so a re-sync can never reopen a cancelled request.
- The trip pool's `SOURCE_STATUSES` list statuses explicitly, so a cancelled request is never in it. Saving a trip re-reads that pool, so a stale trip builder can't add a cancelled request's tools.
- The assign page redirects a cancelled request to its detail page, and `saveAssignmentAction` refuses one.
- `closeRequestAction` refuses anything that isn't open.
- On the detail page:
  - a "Cancelled" notice replaces the stepper;
  - the tool rows are not coloured;
  - the action area shows a red "Cancelled" pill.
- Cards in the list show a red badge and no action.

Known limits:
- **Bubble has no transactions.** A trip planned in the second between the cancel's re-check and its writes isn't caught. Every other write in this app has the same exposure.
- **Records made when the request was created stay.** That covers the WhatsApp message, the ClickUp task and the Outlook event. Bubble never stored the ClickUp task id or the Outlook event id, so they can't be found automatically. The user chose not to send a notification.

## 4. Bubble Studio: checks only, nothing to build

`request.status` is **text**, not an option set, so `Cancelled` needs no schema work, the same as `Returned` when it was added. Every write uses something already live:

| Write | Through |
| --- | --- |
| tool `statusNew` | `update-request-status` (`toolIds` + `toolStatus`) |
| stock back on the shelf | `assign-request-materials` with `release: true` (same call as Close) |
| transfer links | Data API `PATCH requestedmaterials` (same as Close) |
| `request.status` | `update-request-status` (`requestIds` + `status`) |
| `request.notes` | Data API `PATCH /obj/request/{id}`, which is **new**: nothing has written `request` through the Data API before |

Before relying on it, check these in Bubble Studio:

1. **Settings → API → "Enable Data API"**: confirm `request` is ticked. It must be, because every read already goes through it. Then check that the `request` privacy rules don't block modification by the API token's user. If they do, the cancel still happens and the person sees "the cancel note wasn't saved". In that case, either allow it, or ask for an optional `notes` parameter on `update-request-status` instead.
2. **Backend workflows → Database trigger events**: confirm nothing fires on "A request is modified" in a way that would misbehave when `status` becomes `Cancelled` or `notes` changes, such as a ClickUp or Calendar sync.
3. **Optional, old Bubble UI.** If anyone still opens the old calendar, add `status is not "Cancelled"` to its request search so cancelled requests stop showing there.
4. **Manual clean-up for each cancelled request:** delete its ClickUp task and its Outlook calendar event by hand.

## 5. Manual test list

Every test writes to the live database, so pick the requests on purpose.

1. A `New` delivery with nothing assigned: the status changes, the note is added, and no tool or stock writes happen.
2. An `Assigned` delivery with warehouse tools and an inventory line: the tools become `Available`, the stock returns (history reason `Release`), and the request reads `Cancelled`.
3. A delivery holding a tool from a site where a pickup was also raised: that tool goes back to `Pickup Requested`.
4. A pickup: its tools become `Delivered` on the site, and they leave the trip pool.
5. A pickup feeding a delivery by transfer: the link is cleared, and the delivery is re-synced (it may go back to `New`).
6. A request with a tool or material on a draft trip: there is no button, and a direct POST is refused by name.
7. A cancelled request:
   - it is not on the Active tab;
   - it has no card action;
   - `/requests/<id>/assign` redirects;
   - Close is refused.
