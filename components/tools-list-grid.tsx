import { ToolsListCard } from "@/components/tools-list-card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { DashboardTool } from "@/lib/bubble/pickup-tools-types"

/** One page of filtered tools, as a responsive grid — 1 column on a phone up
 *  to 4 on a wide desktop, never a horizontal scroll. */
export function ToolsListGrid({ tools }: { tools: DashboardTool[] }) {
  if (tools.length === 0) {
    return (
      <Empty className="border py-12">
        <EmptyHeader>
          <EmptyTitle>No tools match</EmptyTitle>
          <EmptyDescription>Try clearing a filter or broadening the search.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tools.map((tool) => (
        <ToolsListCard key={tool.id} tool={tool} />
      ))}
    </div>
  )
}
