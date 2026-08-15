export interface LlmConfig {
  url: string
  apiKey: string
  model: string
  vision: boolean
}

const URL_KEY = 'snappy:llmUrl'
const KEY_KEY = 'snappy:llmKey'
const MODEL_KEY = 'snappy:llmModel'
const VISION_KEY = 'snappy:llmVision'

export function getLlmConfig(): LlmConfig {
  try {
    return {
      url: localStorage.getItem(URL_KEY) ?? '',
      apiKey: localStorage.getItem(KEY_KEY) ?? '',
      model: localStorage.getItem(MODEL_KEY) ?? '',
      vision: localStorage.getItem(VISION_KEY) !== '0',
    }
  } catch {
    return { url: '', apiKey: '', model: '', vision: true }
  }
}

export function setLlmConfig(config: LlmConfig): void {
  try {
    localStorage.setItem(URL_KEY, config.url.trim().replace(/\/+$/, ''))
    localStorage.setItem(KEY_KEY, config.apiKey.trim())
    localStorage.setItem(MODEL_KEY, config.model.trim())
    localStorage.setItem(VISION_KEY, config.vision ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
}

export function llmConfigured(): boolean {
  return getLlmConfig().url.length > 0
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{ type: string; [key: string]: unknown }>
}

export async function chat(
  messages: ChatMessage[]
): Promise<string> {
  const config = getLlmConfig()
  const trimmed = config.url.replace(/\/+$/, '')
  const base =
    trimmed.endsWith('/v1') || trimmed.endsWith('/openai') ? trimmed : `${trimmed}/v1`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...openRouterHeaders(config),
  }
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`
  const res = await fetchWithRetry(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages,
      temperature: 0,
    }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      const errMsg: unknown = data?.error?.message
      if (typeof errMsg === 'string') detail = ` — ${errMsg}`
    } catch {
      /* no response body */
    }
    if (res.status === 429) {
      throw new Error(
        'AI server is rate-limited (too many requests). Wait a minute and retry.'
      )
    }
    throw new Error(`AI server error (HTTP ${res.status}${detail})`)
  }
  const data = await res.json()
  const out: unknown = data?.choices?.[0]?.message?.content
  if (typeof out !== 'string' || out.length === 0) {
    throw new Error('AI server returned no response')
  }
  return out.trim()
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 4
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init)
    if (res.status !== 429 || attempt >= retries) return res
    await new Promise((resolve) =>
      setTimeout(resolve, 5000 * Math.pow(2, attempt))
    )
  }
}

function openRouterHeaders(config: LlmConfig): Record<string, string> {
  const headers: Record<string, string> = {}
  if (config.url.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'Snappy Scanner'
  }
  return headers
}

export async function listModels(config: LlmConfig): Promise<string[]> {
  const trimmed = config.url.trim().replace(/\/+$/, '')
  const base =
    trimmed.endsWith('/v1') || trimmed.endsWith('/openai') ? trimmed : `${trimmed}/v1`
  const headers: Record<string, string> = { ...openRouterHeaders(config) }
  if (config.apiKey.trim()) headers['Authorization'] = `Bearer ${config.apiKey.trim()}`
  const res = await fetchWithRetry(`${base}/models`, { headers }, 2)
  if (!res.ok) throw new Error(`Could not list models (HTTP ${res.status})`)
  const data = await res.json()
  const list: unknown = data?.data
  if (!Array.isArray(list)) throw new Error('Provider returned no model list')
  return list
    .map((m) =>
      m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string'
        ? (m as { id: string }).id
        : ''
    )
    .filter((id) => id.length > 0)
    .sort()
}

export async function testConnection(config: LlmConfig): Promise<string> {
  const trimmed = config.url.trim().replace(/\/+$/, '')
  const base =
    trimmed.endsWith('/v1') || trimmed.endsWith('/openai') ? trimmed : `${trimmed}/v1`
  const model = config.model.trim() || 'gpt-4o-mini'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...openRouterHeaders(config),
  }
  if (config.apiKey.trim()) headers['Authorization'] = `Bearer ${config.apiKey.trim()}`

  try {
    const ids = await listModels(config)
    if (!ids.includes(model)) {
      const free = ids.filter((id) => id.includes('free') || id === 'openrouter/free')
      const suggestions = (free.length > 0 ? free : ids).slice(0, 8).join(', ')
      throw new Error(`Model "${model}" not found. Try one of: ${suggestions}`)
    }
  } catch (err) {
    if ((err as Error).message.includes('not found')) throw err
  }

  const res = await fetchWithRetry(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model.trim() || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
      temperature: 0,
      max_tokens: 10,
    }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      const errMsg: unknown = data?.error?.message
      if (typeof errMsg === 'string') detail = ` — ${errMsg}`
    } catch {
      /* no response body */
    }
    throw new Error(`HTTP ${res.status}${detail}`)
  }
  const data = await res.json()
  const out: unknown = data?.choices?.[0]?.message?.content
  if (typeof out !== 'string' || out.length === 0) {
    throw new Error('AI server returned no response')
  }
  return out.trim()
}

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    /* fall through to slicing */
  }
  const braceStart = cleaned.indexOf('{')
  const braceEnd = cleaned.lastIndexOf('}')
  const bracketStart = cleaned.indexOf('[')
  const bracketEnd = cleaned.lastIndexOf(']')
  if (braceStart >= 0 && braceEnd > braceStart) {
    try {
      return JSON.parse(cleaned.slice(braceStart, braceEnd + 1))
    } catch {
      /* continue */
    }
  }
  if (bracketStart >= 0 && bracketEnd > bracketStart) {
    try {
      return JSON.parse(cleaned.slice(bracketStart, bracketEnd + 1))
    } catch {
      /* continue */
    }
  }
  throw new Error('AI returned unparseable JSON')
}
