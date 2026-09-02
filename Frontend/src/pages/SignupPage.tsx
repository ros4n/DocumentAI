import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiRegister, saveSession } from '../lib/api'
import { Button } from '../components/ui/button'
import AuthLayout from '../components/auth/AuthLayout'
import Field from '../components/auth/Field'
import { User, Envelope, Lock, Eye, EyeSlash } from '../components/icons'

interface SignupPageProps {
  onLogin: () => void
  onSignupSuccess: (name: string) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignupPage({ onLogin, onSignupSuccess }: SignupPageProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const touch = (key: string) => setTouched((t) => ({ ...t, [key]: true }))

  const nameError = touched.name && !name.trim() ? 'Enter your full name' : ''
  const emailError = touched.email && !EMAIL_RE.test(email) ? 'Enter a valid email address' : ''
  const passwordError =
    touched.password && password.length < 6 ? 'Password must be at least 6 characters' : ''
  const confirmError = touched.confirm && confirm !== password ? 'Passwords do not match' : ''

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password || password.length < 6 || password !== confirm) {
      setTouched({ name: true, email: true, password: true, confirm: true })
      setError('Please fix the fields above')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await apiRegister(name.trim(), email.trim(), password)
      saveSession(res.token, res.user)
      onSignupSuccess(res.user.name)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle="Join Snappy in seconds"
      footer={
        <>
          Already have an account?{' '}
          <button type="button" onClick={onLogin} className="font-medium text-accent hover:underline">
            Log in
          </button>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        <Field
          label="Full name"
          icon={<User size={18} />}
          placeholder="Ada Lovelace"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => touch('name')}
          autoComplete="name"
          aria-invalid={!!nameError}
          error={nameError}
        />

        <Field
          label="Email"
          type="email"
          icon={<Envelope size={18} />}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => touch('email')}
          autoComplete="email"
          aria-invalid={!!emailError}
          error={emailError}
        />

        <Field
          label="Password"
          type={showPassword ? 'text' : 'password'}
          icon={<Lock size={18} />}
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => touch('password')}
          autoComplete="new-password"
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

        <Field
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          icon={<Lock size={18} />}
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => touch('confirm')}
          autoComplete="new-password"
          aria-invalid={!!confirmError}
          error={confirmError}
        />

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" className="mt-1 w-full" size="lg" loading={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
