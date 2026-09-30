import { permanentRedirect } from "next/navigation"

/** The site page moved to `/sites/[jobId]` once it showed tools as well as
 *  materials. Kept so old links and bookmarks still land. */
export default async function MaterialSiteRedirect({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  permanentRedirect(`/sites/${jobId}`)
}
