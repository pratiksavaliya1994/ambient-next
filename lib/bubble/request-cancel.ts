import "server-only"

import { z } from "zod"

import { ASSIGNED_TOOLS, assignedToolRow } from "@/lib/bubble/assigned-tools"
import { bubbleGet, bubbleListMaybeMissing, bubblePatch, bubbleRunWorkflow } from "@/lib/bubble/client"
import type { RequestStatus } from "@/lib/bubble/enums"
import { listOpenRequestsByIds, REQUEST, type RequestBrief } from "@/lib/bubble/requests"
import type { ToolStatusNew } from "@/lib/bubble/tool-enums"

/**
 * The Bubble half of Cancel request — no new workflow, see `docs/cancel-request.md`.
 * Its own module because `requests.ts` and `assigned-tools.ts` are both past
 * the 300-line cap.
 */

/**
 * **Every** other open request holding each tool — not the first one, which is
 * all `listRequestClaims` keeps. Cancel has to know whether *any* holder is a
 * delivery before it hands a tool back.
 */
export async function listOpenHolders(
  toolIds: readonly string[],
  excludeRequestId: string
): Promise<Map<string, RequestBrief[]>> {
  if (toolIds.length === 0) return new Map()

  const wanted = new Set(toolIds)
  const rows = (
    await bubbleListMaybeMissing(ASSIGNED_TOOLS, {
      constraints: [{ key: "toolID", constraint_type: "in", value: [...toolIds] }],
    })
  )
    .map((raw) => assignedToolRow.parse(raw))
    .filter((row) => row.requestID && row.toolID && row.requestID !== excludeRequestId && wanted.has(row.toolID))
  if (rows.length === 0) return new Map()

  const open = new Map(
    (await listOpenRequestsByIds([...new Set(rows.map((row) => row.requestID!))])).map((request) => [
      request.id,
      request,
    ])
  )

  const byTool = new Map<string, RequestBrief[]>()
  for (const row of rows) {
    const request = open.get(row.requestID!)
    if (request) byTool.set(row.toolID!, [...(byTool.get(row.toolID!) ?? []), request])
  }
  return byTool
}

const updateStatusResult = z.looseObject({ requests: z.number(), tools: z.number() })

/**
 * One `update-request-status` call: these tools to one `statusNew`. The
 * request's **current** status rides along unchanged — the workflow requires
 * one, and the `Cancelled` write comes last so a failure here leaves the
 * request open and Cancel retryable. `location`/`currentUser` aren't sent: a
 * released tool hasn't moved.
 */
export async function setToolStatuses(
  requestId: string,
  requestStatus: RequestStatus,
  toolIds: readonly string[],
  toolStatus: ToolStatusNew
): Promise<{ toolsUpdated: number }> {
  const raw = await bubbleRunWorkflow("update-request-status", {
    requestIds: [requestId],
    status: requestStatus,
    toolIds: [...toolIds],
    toolStatus,
  })
  const result = updateStatusResult.parse(raw)
  if (result.requests !== 1) throw new Error("Bubble did not release this request's tools. Reload and try again.")
  return { toolsUpdated: result.tools }
}

const notesRow = z.looseObject({ notes: z.string().optional() })

/**
 * Appends one line to `request.notes` — a plain `PATCH` on one field, read
 * fresh first so the append doesn't drop a note written since the page loaded.
 */
export async function appendRequestNote(requestId: string, line: string): Promise<void> {
  const row = await bubbleGet(REQUEST, requestId)
  const current = notesRow.parse(row ?? {}).notes?.trim() ?? ""
  await bubblePatch(REQUEST, requestId, { notes: current ? `${current}\n${line}` : line })
}
