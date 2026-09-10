import * as React from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAffiliateAuth } from '@/contexts/AffiliateAuthContext'

export function AffiliateForgotPasswordPage() {
  const { sendPasswordReset } = useAffiliateAuth()
  const [email, setEmail] = React.useState('')
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await sendPasswordReset(email.trim())
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="text-sm text-muted-foreground">If an affiliate account exists for that email, a reset link has been sent.</p>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
          )}
          <Link to="/affiliate/login" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
