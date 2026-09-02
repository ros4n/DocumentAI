import { useEffect, useRef, useState } from 'react'
import type { ReactNode, ChangeEvent } from 'react'
import { motion } from 'framer-motion'
import { loadProfile, saveProfile, fetchProfileFromServer, saveProfileToServer } from '../lib/profile'
import type { ProfileData } from '../lib/profile'
import { getSession } from '../lib/api'
import { Button } from '../components/ui/button'
import { staggerChild, staggerParent } from '../lib/motion'
import { getThemePreference, setThemePreference } from '../lib/theme'
import type { ThemePreference } from '../lib/theme'
import {
  User,
  MapPin,
  Briefcase,
  IdentificationCard,
  Plus,
  X,
  Check,
  SignOut,
  SpinnerGap,
} from '../components/icons'

interface ProfilePageProps {
  showToast: (msg: string) => void
  onLogout: () => void
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
  icon: ReactNode
  fields: Array<{ key: FieldKey; wide?: boolean; type?: string }>
}> = [
  {
    title: 'Personal',
    icon: <User size={15} />,
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
    icon: <MapPin size={15} />,
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
    icon: <Briefcase size={15} />,
    fields: [{ key: 'employer', wide: true }, { key: 'occupation' }],
  },
  {
    title: 'Identity',
    icon: <IdentificationCard size={15} />,
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

const inputCls =
  'h-10 w-full rounded-lg border border-border bg-surface-raised px-3 text-sm text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent'

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  const map: Record<Exclude<SaveState, 'idle'>, ReactNode> = {
    dirty: <span className="text-text-muted">Editing…</span>,
    saving: (
      <span className="flex items-center gap-1.5 text-text-muted">
        <SpinnerGap size={13} className="animate-spin" />
        Saving…
      </span>
    ),
    saved: (
      <span className="flex items-center gap-1 text-success">
        <Check size={13} weight="bold" />
        Saved
      </span>
    ),
    offline: <span className="text-warning">Saved locally, will sync</span>,
  }
  return <span className="text-xs font-medium">{map[state]}</span>
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function ThemeControl() {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference)
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
      <div>
        <h2 className="font-display text-sm font-semibold">Appearance</h2>
        <p className="mt-0.5 text-xs text-text-muted">Follows your device unless you pick one.</p>
      </div>
      <div className="flex shrink-0 rounded-full bg-surface-sunken p-0.5 text-[11px] font-medium">
        {THEME_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => {
              setPref(o.value)
              setThemePreference(o.value)
            }}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              pref === o.value ? 'bg-surface-raised text-text shadow-sm' : 'text-text-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
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

  const scheduleAutosave = () => {
    if (!hydratedRef.current || loading) return
    setSaveState('dirty')
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void persist()
    }, 900)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        void persist()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (key: FieldKey) => (e: ChangeEvent<HTMLInputElement>) => {
    setProfile((prev) => ({ ...prev, [key]: e.target.value }))
    scheduleAutosave()
  }

  const updateCustom = (index: number, patch: Partial<{ label: string; value: string }>) => {
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
    <div className="flex flex-1 flex-col gap-5 pb-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">My details</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Used to auto-fill scanned forms. Saved automatically.
          </p>
        </div>
        <SaveIndicator state={saveState} />
      </header>

      <motion.div
        className="flex flex-col gap-4"
        variants={staggerParent}
        initial="initial"
        animate="animate"
      >
        {SECTIONS.map((section) => {
          const filledCount = section.fields.filter((f) => profile[f.key].trim()).length
          return (
            <motion.section
              key={section.title}
              variants={staggerChild}
              className="rounded-2xl border border-border bg-surface-raised p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
                  {section.icon}
                </span>
                <h2 className="flex-1 font-display text-sm font-semibold">{section.title}</h2>
                <span className="text-xs text-text-faint">
                  {filledCount}/{section.fields.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {section.fields.map(({ key, wide, type }) => (
                  <div key={key} className={`flex flex-col gap-1 ${wide ? 'col-span-2' : ''}`}>
                    <label htmlFor={`profile-${key}`} className="text-xs font-medium text-text-muted">
                      {FIELD_LABELS[key]}
                    </label>
                    <input
                      id={`profile-${key}`}
                      className={inputCls}
                      value={profile[key]}
                      onChange={update(key)}
                      placeholder="Not set"
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

        <motion.section
          variants={staggerChild}
          className="rounded-2xl border border-border bg-surface-raised p-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
              <Plus size={15} />
            </span>
            <h2 className="flex-1 font-display text-sm font-semibold">Custom fields</h2>
            <span className="text-xs text-text-faint">{profile.customFields.length}</span>
          </div>
          <p className="mb-3 text-xs text-text-muted">
            Add your own fields, e.g. Passport Number. These are also matched when auto-filling.
          </p>
          <div className="flex flex-col gap-2">
            {profile.customFields.map((field, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  className={`${inputCls} flex-1`}
                  value={field.label}
                  onChange={(e) => updateCustom(index, { label: e.target.value })}
                  placeholder="Field label"
                  autoCapitalize="words"
                  spellCheck={false}
                />
                <input
                  className={`${inputCls} flex-1`}
                  value={field.value}
                  onChange={(e) => updateCustom(index, { value: e.target.value })}
                  placeholder="Value"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => removeCustomField(index)}
                  aria-label={`Remove ${field.label || 'field'}`}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <Button variant="secondary" className="mt-1 w-full" onClick={addCustomField}>
              <Plus size={16} />
              Add field
            </Button>
          </div>
        </motion.section>
      </motion.div>

      <ThemeControl />

      <Button variant="outline" className="w-full" onClick={onLogout}>
        <SignOut size={16} />
        Log out
      </Button>
    </div>
  )
}
