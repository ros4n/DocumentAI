import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiLogin, saveSession } from '../lib/api'
import { Button } from '../components/ui/button'
import AuthLayout from '../components/auth/AuthLayout'
import Field from '../components/auth/Field'
import { Envelope, Lock, Eye, EyeSlash } from '../components/icons'

interface LoginPageProps {
  onSignup: () => void
  onLoginSuccess: (name: string) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage({ onSignup, onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const emailError = touched.email && !EMAIL_RE.test(email) ? 'Enter a valid email address' : ''
  const passwordError = touched.password && !password ? 'Enter your password' : ''

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password || !EMAIL_RE.test(email)) {
      setTouched({ email: true, password: true })
      setError('Please enter your email and password')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await apiLogin(email.trim(), password)
      saveSession(res.token, res.user)
      onLoginSuccess(res.user.name)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to scan, read, and fill forms"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <button type="button" onClick={onSignup} className="font-medium text-accent hover:underline">
            Sign up
          </button>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        <Field
          label="Email"
          type="email"
          icon={<Envelope size={18} />}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          autoComplete="email"
          aria-invalid={!!emailError}
          error={emailError}
        />

        <Field
          label="Password"
          type={showPassword ? 'text' : 'password'}
          icon={<Lock size={18} />}
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          autoComplete="current-password"
          aria-invalid={!!passwordError}
          error={passwordError}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="shrink-0 text-text-faint hover:text-text-muted"
            >
              {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          }
        />

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" className="mt-1 w-full" size="lg" loading={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
