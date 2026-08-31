import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

type Status = 'accepting' | 'success' | 'error'

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const [status, setStatus] = React.useState<Status>('accepting')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('This invitation link is missing its token.')
      return
    }
    let cancelled = false
    supabase
      .rpc('accept_staff_invitation', { p_token: token })
      .then(({ error: rpcError }) => {
        if (cancelled) return
        if (rpcError) {
          setStatus('error')
          setError(friendlyMessage(rpcError.message))
        } else {
          setStatus('success')
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-10">
          {status === 'accepting' && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Accepting your invitation…</p>
            </>
          )}
          {status === 'success' && (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15 text-success">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold">You're in</h2>
                <p className="mt-1 text-sm text-muted-foreground">Your access has been granted. You can head to the dashboard now.</p>
              </div>
              <Button onClick={() => navigate('/', { replace: true })}>Go to Dashboard</Button>
            </>
          )}
          {status === 'error' && (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold">Couldn't accept this invitation</h2>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" asChild>
                <Link to="/">Go to Dashboard</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function friendlyMessage(message: string): string {
  if (message.includes('invitation_expired')) return 'This invitation has expired. Ask an admin to send you a new one.'
  if (message.includes('invitation_revoked')) return 'This invitation was revoked by the workspace admin.'
  if (message.includes('invitation_already_used')) return 'This invitation link has already been used.'
  if (message.includes('email_mismatch')) return "This invitation was sent to a different email address than the one you're signed in with."
  if (message.includes('invalid_invitation')) return 'This invitation link is not valid.'
  return 'Something went wrong accepting this invitation. Please try again or contact whoever invited you.'
}
