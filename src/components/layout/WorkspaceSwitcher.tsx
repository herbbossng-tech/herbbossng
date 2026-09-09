import { Check, ChevronsUpDown, Globe2, Plus } from 'lucide-react'
import * as React from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { cn } from '@/lib/utils'

import { CreateWorkspaceDialog } from './CreateWorkspaceDialog'

const statusDot: Record<string, string> = {
  active: 'bg-success',
  inactive: 'bg-muted-foreground',
  suspended: 'bg-destructive',
}

export function WorkspaceSwitcher() {
  const { workspaces, brands, activeWorkspace, setActiveWorkspaceId } = useWorkspace()
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="max-w-[9rem] truncate">{activeWorkspace.name}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((workspace) => {
            const firstBrand = brands.find((b) => b.workspace_id === workspace.id)
            const contextLine = [workspace.country_code, workspace.currency_code, firstBrand?.name].filter(Boolean).join(' · ')
            return (
              <DropdownMenuItem key={workspace.id} onSelect={() => setActiveWorkspaceId(workspace.id)} className="flex-col items-start gap-0 py-2">
                <div className="flex w-full items-center gap-2">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot[workspace.status])} />
                  <span className="flex-1 truncate font-medium">{workspace.name}</span>
                  {workspace.id === activeWorkspace.id && <Check className="h-4 w-4 text-primary" />}
                </div>
                {contextLine && <span className="pl-3.5 text-xs text-muted-foreground">{contextLine}</span>}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>New Workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
