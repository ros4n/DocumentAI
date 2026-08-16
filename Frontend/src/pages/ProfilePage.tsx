import { useEffect, useState } from 'react'
import { loadProfile, saveProfile, fetchProfileFromServer, saveProfileToServer } from '../lib/profile'
import type { ProfileData } from '../lib/profile'
import { getSession } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

interface ProfilePageProps {
  showToast: (msg: string) => void
  onLogout: () => void
}

interface CustomField {
  label: string
  value: string
}

type FieldKey = keyof Omit<ProfileData, 'customFields'>

export default function ProfilePage({ showToast, onLogout }: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfileData>(loadProfile)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (!session) return
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
        if (!cancelled) showToast('Offline â€” showing saved local details')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showToast])

  const update = (key: FieldKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfile((prev) => ({ ...prev, [key]: e.target.value }))
  }

  const updateCustom = (index: number, patch: Partial<CustomField>) => {
    setProfile((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }))
  }

  const addCustomField = () => {
    setProfile((prev) => ({
      ...prev,
      customFields: [...prev.customFields, { label: '', value: '' }],
    }))
  }

  const removeCustomField = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((_, i) => i !== index),
    }))
  }

  const onSave = async () => {
    const session = getSession()
    const cleaned: ProfileData = {
      ...profile,
      customFields: profile.customFields
        .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
        .filter((f) => f.label && f.value),
    }
    setProfile(cleaned)
    if (session) {
      setSaving(true)
      try {
        await saveProfileToServer(session.token, cleaned)
        showToast('Details saved')
      } catch {
        saveProfile(cleaned)
        showToast('Saved locally (server offline)')
      } finally {
        setSaving(false)
      }
    } else {
      saveProfile(cleaned)
      showToast('Details saved')
    }
  }

  const group = (title: string, keys: FieldKey[]) => (
    <Card className="profile-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {keys.map((key) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={`profile-${key}`}>
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
            </Label>
            <Input
              id={`profile-${key}`}
              value={profile[key]}
              onChange={update(key)}
              placeholder="â€”"
              autoCapitalize="words"
              spellCheck={false}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )

  return (
    <div className="profile-page">
      <header className="profile-head">
        <h1>My Details</h1>
        <p>These details are used to auto-fill scanned forms.</p>
      </header>

      {group('Personal', ['fullName', 'firstName', 'lastName', 'email', 'phone', 'dob', 'gender', 'maritalStatus'])}
      {group('Address', ['address', 'city', 'state', 'zip', 'country'])}
      {group('Work', ['employer', 'occupation'])}
      {group('Other', ['nationality', 'idNumber'])}

      <Card className="profile-card">
        <CardHeader>
          <CardTitle>Custom fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
                aria-label="Remove field"
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
        </CardContent>
      </Card>

      <Button className="profile-save w-full" onClick={onSave} disabled={saving || loading} size="lg">
        {saving ? <span className="spinner" /> : 'Save details'}
      </Button>

      <Button variant="secondary" className="logout-btn w-full" onClick={onLogout}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Log out
      </Button>
    </div>
  )
}
