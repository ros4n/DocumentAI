import { Suspense, lazy, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Toaster } from 'sonner'
import { apiMe, clearSession, getSession } from './lib/api'
import { prefillProfileName } from './lib/profile'
import { IconProvider } from './components/icons'

// Route-level code splitting: a logged-out visitor only downloads the
// landing chunk; the app shell (HomePage + capture/OCR/fill pipeline,
// framer, all dialogs) loads on demand after sign-in.
const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const HomePage = lazy(() => import('./pages/HomePage'))

type Page = 'landing' | 'login' | 'signup' | 'home'

function Splash() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-surface-page">
      <img src="/icon.svg" alt="Snappy" className="h-12 w-12" />
      <div className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('landing')
  const [checking, setChecking] = useState(true)
  const [direction, setDirection] = useState(1)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      setChecking(false)
      return
    }
    apiMe(session.token)
      .then((user) => {
        prefillProfileName(user.name)
        setDirection(1)
        setPage('home')
      })
      .catch(() => {
        clearSession()
        setPage('landing')
      })
      .finally(() => setChecking(false))
  }, [])

  const goHome = (name: string, isFreshSignup: boolean) => {
    prefillProfileName(name, isFreshSignup)
    setDirection(1)
    setPage('home')
  }

  const logout = () => {
    clearSession()
    setDirection(-1)
    setPage('landing')
  }

  const go = (next: Page, dir: number) => {
    setDirection(dir)
    setPage(next)
  }

  if (checking) return <Splash />

  const routed = (
    <div
      key={page}
      className="page-enter flex w-full justify-center"
      style={{ '--page-enter-x': `${direction >= 0 ? 24 : -24}px` } as CSSProperties}
    >
      {page === 'landing' && (
        <LandingPage onGetStarted={() => go('signup', 1)} onLogin={() => go('login', 1)} />
      )}
      {page === 'signup' && (
        <div className="app-shell">
          <SignupPage onLogin={() => go('login', -1)} onSignupSuccess={(name) => goHome(name, true)} />
        </div>
      )}
      {page === 'login' && (
        <div className="app-shell">
          <LoginPage onSignup={() => go('signup', 1)} onLoginSuccess={(name) => goHome(name, false)} />
        </div>
      )}
      {page === 'home' && (
        <div className="app-shell">
          <HomePage onLogout={logout} />
        </div>
      )}
    </div>
  )

  return (
    <IconProvider>
      <Suspense fallback={<Splash />}>{routed}</Suspense>
      <Toaster
        theme="system"
        position="bottom-center"
        offset={88}
        toastOptions={{ duration: 2600 }}
      />
    </IconProvider>
  )
}
