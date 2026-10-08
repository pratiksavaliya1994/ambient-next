import { z } from "zod"

import { TOOL_CONDITION } from "@/lib/bubble/tool-enums"
import { MAX_STOCK_TAKE_BATCH } from "@/lib/tools/stock-take"

/**
 * One location's count. `location` is picked from the jobs list, never typed;
 * `saveStockTakeAction` still checks it against live `jobs` with
 * `isKnownToolLocation`, because a server action is reachable by direct POST.
 */
export const stockTakeSaveSchema = z.object({
  location: z.string().trim().min(1, "Pick a location."),
  toolIds: z.array(z.string().min(1)).min(1, "Tick at least one tool.").max(MAX_STOCK_TAKE_BATCH),
  floor: z.string().trim().max(120),
  /** `""` leaves each tool's condition alone. */
  condition: z.enum(TOOL_CONDITION).or(z.literal("")),
})

export type StockTakeSaveInput = z.infer<typeof stockTakeSaveSchema>
