import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { type ForgotPasswordValues, forgotPasswordSchema } from '@/lib/validation/auth'

export function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [formError, setFormError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (values: ForgotPasswordValues) => {
    setFormError(null)
    const { error } = await sendPasswordReset(values.email)
    if (error) {
      setFormError(error)
      return
    }
    setSent(true)
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      description="Enter your email and we'll send you a reset link."
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>If an account exists for that email, a reset link is on its way. Check your inbox.</span>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                className="pl-9"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
            </div>
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          {formError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <Button type="submit" className="mt-2 w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
