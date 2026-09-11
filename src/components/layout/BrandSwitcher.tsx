import { Check, ChevronsUpDown, Tag } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspace } from '@/contexts/WorkspaceContext'

export function BrandSwitcher() {
  const { workspaceBrands, activeBrand, setActiveBrandId } = useWorkspace()

  if (workspaceBrands.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-[8rem] truncate">{activeBrand?.name ?? 'Select brand'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Brands in this workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaceBrands.map((brand) => (
          <DropdownMenuItem key={brand.id} onSelect={() => setActiveBrandId(brand.id)}>
            <span className="flex-1 truncate">{brand.name}</span>
            {brand.id === activeBrand?.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
