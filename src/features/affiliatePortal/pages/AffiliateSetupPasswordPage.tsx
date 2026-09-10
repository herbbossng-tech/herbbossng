import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAffiliateAuth } from '@/contexts/AffiliateAuthContext'
import { supabaseAffiliate } from '@/lib/supabaseAffiliate'

export function AffiliateSetupPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { signIn } = useAffiliateAuth()

  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError('This link is missing its setup token — ask your workspace contact for a fresh link.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { data, error: fnError } = await supabaseAffiliate.functions.invoke<{ email?: string; error?: string }>(
      'activate-affiliate-portal-access',
      { body: { token, password } },
    )
    if (fnError || data?.error) {
      setSubmitting(false)
      setError(data?.error ?? fnError?.message ?? 'Could not activate portal access.')
      return
    }

    const email = data?.email
    if (!email) {
      setSubmitting(false)
      setError('Portal access was created but sign-in failed — try signing in manually.')
      return
    }

    const result = await signIn(email, password)
    setSubmitting(false)
    if (result.error) {
      navigate('/affiliate/login')
      return
    }
    navigate('/affiliate')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <p className="text-sm text-muted-foreground">Choose a password to activate your affiliate portal access.</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Activating…' : 'Activate & sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
