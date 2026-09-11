import * as React from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAffiliateAuth } from '@/contexts/AffiliateAuthContext'

export function AffiliateLoginPage() {
  const { session, signIn } = useAffiliateAuth()
  const location = useLocation()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  if (session) {
    const from = (location.state as { from?: Location })?.from
    return <Navigate to={from?.pathname ?? '/affiliate'} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await signIn(email.trim(), password)
    setSubmitting(false)
    if (result.error) setError(result.error)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Affiliate Portal</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to create order forms and track your earnings.</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="affiliate-email">Email</Label>
              <Input id="affiliate-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="affiliate-password">Password</Label>
              <Input id="affiliate-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <Link to="/affiliate/forgot-password" className="text-center text-xs text-muted-foreground hover:text-foreground hover:underline">
              Forgot your password?
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
