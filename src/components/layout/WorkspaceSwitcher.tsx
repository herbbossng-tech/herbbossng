import { Check, ChevronsUpDown, Globe2 } from 'lucide-react'

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

const statusDot: Record<string, string> = {
  active: 'bg-success',
  inactive: 'bg-muted-foreground',
  suspended: 'bg-destructive',
}

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
          <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-[9rem] truncate">{activeWorkspace.name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem key={workspace.id} onSelect={() => setActiveWorkspaceId(workspace.id)}>
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot[workspace.status])} />
            <span className="flex-1 truncate">{workspace.name}</span>
            {workspace.id === activeWorkspace.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
