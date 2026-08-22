import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { loadProfile, saveProfile, fetchProfileFromServer, saveProfileToServer } from '../lib/profile'
import type { ProfileData } from '../lib/profile'
import { getSession } from '../lib/api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { staggerChild, staggerParent } from '../lib/motion'

interface ProfilePageProps {
  showToast: (msg: string) => void
  onLogout: () => void
}

interface CustomField {
  label: string
  value: string
}

type FieldKey = keyof Omit<ProfileData, 'customFields'>
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline'

const FIELD_LABELS: Record<FieldKey, string> = {
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  dob: 'Date of birth',
  address: 'Street address',
  city: 'City',
  state: 'State / Region',
  zip: 'ZIP / Postal code',
  country: 'Country',
  employer: 'Employer',
  occupation: 'Occupation',
  gender: 'Gender',
  maritalStatus: 'Marital status',
  nationality: 'Nationality',
  idNumber: 'ID number',
}

const SECTIONS: Array<{
  title: string
  icon: React.ReactNode
  fields: Array<{ key: FieldKey; wide?: boolean; type?: string }>
}> = [
  {
    title: 'Personal',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    fields: [
      { key: 'fullName', wide: true },
      { key: 'firstName' },
      { key: 'lastName' },
      { key: 'email', wide: true },
      { key: 'phone' },
      { key: 'dob', type: 'date' },
      { key: 'gender' },
      { key: 'maritalStatus' },
    ],
  },
  {
    title: 'Address',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    fields: [
      { key: 'address', wide: true },
      { key: 'city' },
      { key: 'state' },
      { key: 'zip' },
      { key: 'country' },
    ],
  },
  {
    title: 'Work',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
    fields: [{ key: 'employer', wide: true }, { key: 'occupation' }],
  },
  {
    title: 'Identity',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <circle cx="8" cy="11" r="2" />
        <path d="M5 17c.8-1.6 1.7-2.4 3-2.4s2.2.8 3 2.4" />
        <line x1="14" y1="10" x2="19" y2="10" />
        <line x1="14" y1="14" x2="19" y2="14" />
      </svg>
    ),
    fields: [{ key: 'nationality' }, { key: 'idNumber' }],
  },
]

function cleanCustomFields(profile: ProfileData): ProfileData {
  return {
    ...profile,
    customFields: profile.customFields
      .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
      .filter((f) => f.label && f.value),
  }
}

export default function ProfilePage({ showToast, onLogout }: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfileData>(loadProfile)
  const [loading, setLoading] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const hydratedRef = useRef(false)
  const profileRef = useRef(profile)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  useEffect(() => {
    const session = getSession()
    if (!session) {
      hydratedRef.current = true
      return
    }
    let cancelled = false
    setLoading(true)
    fetchProfileFromServer(session.token)
      .then((server) => {
        if (cancelled) return
        const local = loadProfile()
        if (!local.fullName.trim() && !server.fullName.trim()) return
        setProfile(server)
      })
      .catch(() => {
        if (!cancelled) showToast('Offline — showing saved local details')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          // let effects settle before enabling autosave
          window.setTimeout(() => {
            hydratedRef.current = true
          }, 300)
        }
      })
    return () => {
      cancelled = true
    }
  }, [showToast])

  const persist = async () => {
    const cleaned = cleanCustomFields(profileRef.current)
    setProfile(cleaned)
    profileRef.current = cleaned
    const session = getSession()
    if (session) {
      setSaveState('saving')
      try {
        await saveProfileToServer(session.token, cleaned)
        setSaveState('saved')
      } catch {
        saveProfile(cleaned)
        setSaveState('offline')
      }
    } else {
      saveProfile(cleaned)
      setSaveState('saved')
    }
  }

  // Debounced autosave — fires ~900ms after the last keystroke
  const scheduleAutosave = () => {
    if (!hydratedRef.current || loading) return
    setSaveState('dirty')
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void persist()
    }, 900)
  }

  // Flush a pending save when leaving the tab/page
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        void persist()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (key: FieldKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfile((prev) => ({ ...prev, [key]: e.target.value }))
    scheduleAutosave()
  }

  const updateCustom = (index: number, patch: Partial<CustomField>) => {
    setProfile((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }))
    scheduleAutosave()
  }

  const addCustomField = () => {
    setProfile((prev) => ({
      ...prev,
      customFields: [...prev.customFields, { label: '', value: '' }],
    }))
    scheduleAutosave()
  }

  const removeCustomField = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((_, i) => i !== index),
    }))
    scheduleAutosave()
  }

  return (
    <div className="profile-page">
      <header className="profile-head">
        <div>
          <h1>My Details</h1>
          <p>These details are used to auto-fill scanned forms.</p>
        </div>
        <AnimatePresence mode="wait">
          {saveState === 'dirty' && (
            <motion.span
              key="dirty"
              className="save-indicator saving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Editing…
            </motion.span>
          )}
          {saveState === 'saving' && (
            <motion.span
              key="saving"
              className="save-indicator saving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="btn-spinner" style={{ borderTopColor: 'var(--text-muted)', borderColor: 'rgba(33,29,25,0.15)' }} />
              Saving…
            </motion.span>
          )}
          {saveState === 'saved' && (
            <motion.span
              key="saved"
              className="save-indicator"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { delay: 1.2 } }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved
            </motion.span>
          )}
          {saveState === 'offline' && (
            <motion.span
              key="offline"
              className="save-indicator offline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Saved locally — will sync later
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      <motion.div
        className="profile-sections"
        variants={staggerParent}
        initial="initial"
        animate="animate"
      >
        {SECTIONS.map((section) => {
          const filledCount = section.fields.filter((f) => profile[f.key].trim()).length
          return (
            <motion.section key={section.title} variants={staggerChild} className="profile-section-card">
              <div className="profile-section-head">
                <span className="profile-section-icon">{section.icon}</span>
                <h2 className="profile-section-title">{section.title}</h2>
                <span className="profile-section-count">
                  {filledCount}/{section.fields.length}
                </span>
              </div>
              <div className="profile-section-body">
                {section.fields.map(({ key, wide, type }) => (
                  <div key={key} className={`field-cell ${wide ? 'field-wide' : ''}`}>
                    <Label htmlFor={`profile-${key}`}>{FIELD_LABELS[key]}</Label>
                    <Input
                      id={`profile-${key}`}
                      value={profile[key]}
                      onChange={update(key)}
                      placeholder="—"
                      type={type ?? 'text'}
                      autoCapitalize={type === 'date' ? undefined : 'words'}
                      spellCheck={false}
                    />
                  </div>
                ))}
              </div>
            </motion.section>
          )
        })}

        <motion.section variants={staggerChild} className="profile-section-card">
          <div className="profile-section-head">
            <span className="profile-section-icon">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <h2 className="profile-section-title">Custom fields</h2>
            <span className="profile-section-count">{profile.customFields.length}</span>
          </div>
          <div className="profile-section-body" style={{ display: 'block' }}>
            <p className="profile-hint">
              Add your own fields (e.g. Passport Number). These are also matched when auto-filling forms.
            </p>
            {profile.customFields.map((field, index) => (
              <div key={index} className="custom-field-row">
                <Input
                  className="custom-field-label"
                  value={field.label}
                  onChange={(e) => updateCustom(index, { label: e.target.value })}
                  placeholder="Field label (e.g. Passport Number)"
                  autoCapitalize="words"
                  spellCheck={false}
                />
                <Input
                  className="custom-field-value"
                  value={field.value}
                  onChange={(e) => updateCustom(index, { value: e.target.value })}
                  placeholder="Value"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="icon-btn custom-field-remove"
                  onClick={() => removeCustomField(index)}
                  aria-label={`Remove ${field.label || 'field'}`}
                  title="Remove field"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
            <Button variant="secondary" className="custom-field-add" onClick={addCustomField}>
              + Add field
            </Button>
          </div>
        </motion.section>
      </motion.div>

      <div className="profile-footer">
        <p className="profile-hint">Changes save automatically.</p>
        <Button variant="secondary" className="logout-btn" onClick={onLogout}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log out
        </Button>
      </div>
    </div>
  )
}
