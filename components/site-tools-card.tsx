import { groupToolsByType, ToolTypeList } from "@/components/tool-type-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { PickupTool } from "@/lib/bubble/pickup-tools-types"

/**
 * The job site page's tools: every `tools` row whose `location` is this job,
 * in the Job Dashboard's by-type list.
 *
 * Unlike the materials beside it this is where the tool *is*, not an upper
 * bound — `location` moves on dispatch, offload and collect.
 */
export function SiteToolsCard({ tools }: { tools: readonly PickupTool[] }) {
  return (
    <Card data-size="sm">
      <CardHeader>
        <CardTitle className="text-base">Tools on site</CardTitle>
        <span className="text-sm text-muted-foreground tabular-nums">
          {tools.length} {tools.length === 1 ? "tool" : "tools"}
        </span>
      </CardHeader>
      <CardContent className="gap-0">
        {tools.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyTitle>No tools here</EmptyTitle>
              <EmptyDescription>No tool is currently at this site.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ToolTypeList {...groupToolsByType(tools)} />
        )}
      </CardContent>
    </Card>
  )
}
