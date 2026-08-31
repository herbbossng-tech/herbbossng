import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Loader2, Lock, Mail } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { type LoginValues, loginSchema } from '@/lib/validation/auth'

export function Login() {
  const { signIn, isSupabaseConfigured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  })

  const onSubmit = async (values: LoginValues) => {
    setFormError(null)
    const { error } = await signIn(values.email, values.password)
    if (error) {
      setFormError(error)
      return
    }
    const from = (location.state as { from?: Location })?.from
    // Preserve the query string too (e.g. /invitations/accept?token=...) — not just the path.
    const redirectTo = from ? `${from.pathname}${from.search ?? ''}` : '/'
    navigate(redirectTo, { replace: true })
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to your Golden Commerce OS workspace."
      footer={
        <>
          Forgot your password?{' '}
          <Link to="/forgot-password" className="font-semibold text-primary hover:underline">
            Reset it
          </Link>
        </>
      }
    >
      {!isSupabaseConfigured && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Supabase isn&apos;t connected yet. Add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> to enable sign-in.
          </span>
        </div>
      )}

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

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="pl-9"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 rounded border-border accent-[var(--color-primary)]" {...register('rememberMe')} />
          Remember me on this device
        </label>

        {formError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <Button type="submit" className="mt-2 w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
