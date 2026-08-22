import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiLogin, saveSession } from '../lib/api'
import { Button } from '../components/ui/button'

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
    <div className="auth-page">
      <div className="auth-bg-glow" />

      <div className="auth-brand">
        <div className="brand-logo">
          <img className="brand-logo-img" src="/icon.svg" alt="Snappy" />
        </div>
        <h1>Welcome back</h1>
        <p>Log in to scan, OCR, and fill forms</p>
      </div>

      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <div className={`auth-field ${emailError ? 'has-error' : email && !emailError ? 'valid' : ''}`}>
          <span className="field-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </span>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            autoComplete="email"
            aria-invalid={!!emailError}
          />
        </div>
        {emailError && (
          <p className="field-error" role="alert">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {emailError}
          </p>
        )}

        <div className={`auth-field ${passwordError ? 'has-error' : ''}`}>
          <span className="field-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            autoComplete="current-password"
            aria-invalid={!!passwordError}
          />
          <button
            type="button"
            className="field-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {passwordError && (
          <p className="field-error" role="alert">{passwordError}</p>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <Button type="submit" className="btn-submit w-full" loading={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </Button>

        <p className="auth-switch">
          Don&apos;t have an account?{' '}
          <button type="button" onClick={onSignup}>Sign up</button>
        </p>
      </form>
    </div>
  )
}
