"use server"

import { z } from "zod"

import { requireSession } from "@/lib/auth/session"
import { listSiteStock } from "@/lib/bubble/site-stock"
import { groupBySite, type SiteItem } from "@/lib/bubble/site-stock-types"

/**
 * The pickup form's hint (5F §2.1): what this job has been sent and not sent
 * back, by catalogue item, called when the PM picks the job.
 *
 * **A hint, never a limit.** Use on site isn't tracked, so this is an upper
 * bound, and the driver's count at the collect stop is the truth. Duplicate
 * site rows are summed and empty ones dropped by `groupBySite`. A read, so no
 * `revalidatePath`.
 */
export async function listSiteStockAction(job: unknown): Promise<SiteItem[]> {
  await requireSession()
  const parsed = z.string().trim().min(1).safeParse(job)
  if (!parsed.success) return []
  const [site] = groupBySite(await listSiteStock({ location: parsed.data }))
  return site?.items ?? []
}
