import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import HomePage from './pages/HomePage'
import { apiMe, clearSession, getSession } from './lib/api'
import { prefillProfileName } from './lib/profile'

type Page = 'login' | 'signup' | 'home'

export default function App() {
  const [page, setPage] = useState<Page>('login')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      setChecking(false)
      return
    }
    apiMe(session.token)
      .then((user) => {
        prefillProfileName(user.name)
        setPage('home')
      })
      .catch(() => {
        clearSession()
        setPage('login')
      })
      .finally(() => setChecking(false))
  }, [])

  const goHome = (name: string, isFreshSignup: boolean) => {
    prefillProfileName(name, isFreshSignup)
    setPage('home')
  }

  const logout = () => {
    clearSession()
    setPage('login')
  }

  let content
  if (checking) {
    content = (
      <div className="auth-page">
        <div className="auth-bg-glow" />
        <div className="auth-brand">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <h1>Snappy</h1>
        </div>
        <div className="spinner auth-check-spinner" />
      </div>
    )
  } else if (page === 'signup') {
    content = (
      <SignupPage
        onLogin={() => setPage('login')}
        onSignupSuccess={(name) => goHome(name, true)}
      />
    )
  } else if (page === 'home') {
    content = <HomePage onLogout={logout} />
  } else {
    content = (
      <LoginPage
        onSignup={() => setPage('signup')}
        onLoginSuccess={(name) => goHome(name, false)}
      />
    )
  }

  return (
    <div className="app-shell">
      {content}
      <Toaster theme="dark" position="bottom-center" offset={80} toastOptions={{ duration: 2600 }} />
    </div>
  )
}
