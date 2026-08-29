import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function Unauthorized() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <div>
        <h1 className="text-xl font-bold text-foreground">You don&apos;t have access to this page</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your role doesn&apos;t include the permission required here. Ask a workspace Owner or Admin to grant it.
        </p>
      </div>
      <Button asChild size="sm">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  )
}
