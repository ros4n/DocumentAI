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
          <img className="brand-logo-img" src="/icon.svg" alt="Snappy" />
        </div>
          <h1>Snappy</h1> {/* app title */}
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
