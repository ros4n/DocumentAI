const API_BASE = '/api'
const TOKEN_KEY = 'snappy:token'
const USER_KEY = 'snappy:user'

export interface AuthUser {
  id: number
  email: string
  name: string
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.token) headers['Authorization'] = `Token ${options.token}`
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const err = data && typeof data === 'object' && 'error' in data
      ? String((data as { error: unknown }).error)
      : `Server error (HTTP ${res.status})`
    throw new Error(err)
  }
  return data as T
}

export function saveSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getSession(): { token: string; user: AuthUser } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const rawUser = localStorage.getItem(USER_KEY)
    if (!token || !rawUser) return null
    return { token, user: JSON.parse(rawUser) as AuthUser }
  } catch {
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export function apiRegister(name: string, email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register/', {
    method: 'POST',
    body: { name, email, password },
  })
}

export function apiLogin(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login/', {
    method: 'POST',
    body: { email, password },
  })
}

export function apiMe(token: string): Promise<AuthUser> {
  return request<AuthUser>('/auth/me/', { token })
}

export interface CustomField {
  label: string
  value: string
}

export interface ProfilePayload {
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

export function apiGetProfile(token: string): Promise<ProfilePayload> {
  return request<ProfilePayload>('/profile/', { token })
}

export function apiSaveProfile(token: string, profile: ProfilePayload): Promise<ProfilePayload> {
  return request<ProfilePayload>('/profile/', { method: 'PUT', token, body: profile })
}

export interface ScanRecord {
  id: number
  created_at: string
  name: string
  scan_type: 'image' | 'pdf'
  source: 'camera' | 'upload' | 'pdf'
  preview_image: string
  ocr_text: string
  ocr_engine: string
  pages: number
  filled_image: string
  filled_at: string | null
}

export interface ScanCreateInput {
  scan_type: 'image' | 'pdf'
  source: 'camera' | 'upload' | 'pdf'
  name?: string
  preview_image?: string
  ocr_text?: string
  ocr_engine?: string
  pages?: number
  filled_image?: string
}

export function apiListScans(
  token: string,
  params: { search?: string; type?: string; status?: string } = {}
): Promise<ScanRecord[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.type) qs.set('type', params.type)
  if (params.status) qs.set('status', params.status)
  const query = qs.toString()
  return request<ScanRecord[]>(`/scans/${query ? `?${query}` : ''}`, { token })
}

export function apiCreateScan(token: string, input: ScanCreateInput): Promise<ScanRecord> {
  return request<ScanRecord>('/scans/', { method: 'POST', token, body: input })
}

export function apiDeleteScan(token: string, id: number): Promise<void> {
  return request<void>(`/scans/${id}/`, { method: 'DELETE', token })
}

export function apiSetScanFilled(token: string, id: number, filledImage: string): Promise<ScanRecord> {
  return request<ScanRecord>(`/scans/${id}/`, {
    method: 'PATCH',
    token,
    body: { filled_image: filledImage },
  })
}

export function apiRenameScan(token: string, id: number, name: string): Promise<ScanRecord> {
  return request<ScanRecord>(`/scans/${id}/`, {
    method: 'PATCH',
    token,
    body: { name },
  })
}
