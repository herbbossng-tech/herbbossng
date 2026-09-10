import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAffiliateAuth } from '@/contexts/AffiliateAuthContext'

export function AffiliateResetPasswordPage() {
  const { updatePassword } = useAffiliateAuth()
  const navigate = useNavigate()
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await updatePassword(password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    navigate('/affiliate')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
