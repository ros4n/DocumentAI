import { apiGetProfile, apiSaveProfile } from './api'
import type { CustomField, ProfilePayload } from './api'

export interface ProfileData {
  fullName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  dob: string
  address: string
  city: string
  state: string
  zip: string
  country: string
  employer: string
  occupation: string
  gender: string
  maritalStatus: string
  nationality: string
  idNumber: string
  customFields: CustomField[]
}

const PROFILE_KEY = 'snappy:profile'

export const EMPTY_PROFILE: ProfileData = {
  fullName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dob: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  country: '',
  employer: '',
  occupation: '',
  gender: '',
  maritalStatus: '',
  nationality: '',
  idNumber: '',
  customFields: [],
}

export function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return { ...EMPTY_PROFILE }
    const parsed = JSON.parse(raw) as Partial<ProfileData>
    return { ...EMPTY_PROFILE, ...parsed }
  } catch {
    return { ...EMPTY_PROFILE }
  }
}

export function saveProfile(profile: ProfileData): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* storage unavailable */
  }
}

export function prefillProfileName(name: string, overwrite = false): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const profile = loadProfile()
  if (!overwrite && profile.fullName.trim()) return
  const parts = trimmed.split(/\s+/)
  saveProfile({
    ...profile,
    fullName: trimmed,
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  })
}

export function hasProfileData(profile: ProfileData): boolean {
  if (profile.customFields.some((f) => f.label.trim() && f.value.trim())) return true
  return FIXED_KEYS.some((key) => profile[key].trim().length > 0)
}

const FIXED_KEYS = Object.keys(EMPTY_PROFILE).filter(
  (k) => k !== 'customFields'
) as (keyof Omit<ProfileData, 'customFields'>)[]

export function profileToPayload(profile: ProfileData): ProfilePayload {
  const { customFields, ...rest } = profile
  return { ...rest, customFields }
}

function profileFromPayload(payload: ProfilePayload): ProfileData {
  const { customFields, ...rest } = payload
  return {
    ...EMPTY_PROFILE,
    ...rest,
    customFields: Array.isArray(customFields)
      ? customFields
          .filter((f) => f && typeof f.label === 'string' && typeof f.value === 'string')
          .map((f) => ({ label: f.label, value: f.value }))
      : [],
  }
}

export async function fetchProfileFromServer(token: string): Promise<ProfileData> {
  const payload = await apiGetProfile(token)
  const profile = profileFromPayload(payload)
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* storage unavailable */
  }
  return profile
}

export async function saveProfileToServer(token: string, profile: ProfileData): Promise<void> {
  await apiSaveProfile(token, profileToPayload(profile))
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* storage unavailable */
  }
}
