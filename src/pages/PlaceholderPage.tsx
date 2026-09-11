import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-10">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <p className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
            Coming up next
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
