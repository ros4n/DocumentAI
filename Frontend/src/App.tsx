import { useEffect, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Toaster } from 'sonner'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import HomePage from './pages/HomePage'
import { apiMe, clearSession, getSession } from './lib/api'
import { prefillProfileName } from './lib/profile'

type Page = 'login' | 'signup' | 'home'

// Directional slide: signup sits "after" login in the flow
const pageVariants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 28 : -28,
    scale: 0.99,
  }),
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -20 : 20,
    scale: 0.995,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as const },
  }),
}

export default function App() {
  const [page, setPage] = useState<Page>('login')
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
        setPage('login')
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
          <h1>Snappy</h1>
        </div>
        <div className="spinner auth-check-spinner" />
      </div>
    )
  } else {
    content = (
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        {page === 'signup' && (
          <motion.div
            key="signup"
            className="app-page"
            custom={direction}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <SignupPage
              onLogin={() => {
                setDirection(-1)
                setPage('login')
              }}
              onSignupSuccess={(name) => goHome(name, true)}
            />
          </motion.div>
        )}
        {page === 'home' && (
          <motion.div
            key="home"
            className="app-page"
            custom={direction}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <HomePage onLogout={logout} />
          </motion.div>
        )}
        {page === 'login' && (
          <motion.div
            key="login"
            className="app-page"
            custom={direction}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <LoginPage
              onSignup={() => {
                setDirection(1)
                setPage('signup')
              }}
              onLoginSuccess={(name) => goHome(name, false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        {content}
        <Toaster
          theme="light"
          position="bottom-center"
          offset={88}
          toastOptions={{ duration: 2600 }}
        />
      </div>
    </MotionConfig>
  )
}
