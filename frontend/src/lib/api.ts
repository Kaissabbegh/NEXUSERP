const ACCESS = 'nexus.access'
const REFRESH = 'nexus.refresh'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    } catch {
      /* storage unavailable: session-only login */
    }
  },
}

export const tokens = {
  get access() {
    return storage.get(ACCESS)
  },
  save(access: string, refresh?: string) {
    storage.set(ACCESS, access)
    if (refresh) storage.set(REFRESH, refresh)
  },
  clear() {
    storage.set(ACCESS, null)
    storage.set(REFRESH, null)
  },
}

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

/** Turns DRF error payloads ({detail}, ["msg"], {field: ["msg"]}) into one readable sentence. */
function errorMessage(body: unknown): string {
  if (!body) return 'Something went wrong.'
  if (typeof body === 'string') return body
  if (Array.isArray(body)) return body.map(errorMessage).join(' ')
  if (typeof body === 'object') {
    const obj = body as Record<string, unknown>
    if ('detail' in obj) return errorMessage(obj.detail)
    return Object.entries(obj)
      .map(([k, v]) => (k === 'non_field_errors' ? errorMessage(v) : `${k.replace(/_/g, ' ')}: ${errorMessage(v)}`))
      .join(' ')
  }
  return String(body)
}

async function refresh(): Promise<boolean> {
  const token = storage.get(REFRESH)
  if (!token) return false
  const r = await fetch('/api/auth/refresh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: token }),
  })
  if (!r.ok) return false
  const data = await r.json()
  tokens.save(data.access, data.refresh)
  return true
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const { json, ...rest } = init
  const headers = new Headers(rest.headers)
  if (json !== undefined) headers.set('Content-Type', 'application/json')
  if (tokens.access) headers.set('Authorization', `Bearer ${tokens.access}`)

  const r = await fetch(`/api${path}`, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body })
  if (r.status === 401 && retry && (await refresh())) return api<T>(path, init, false)
  if (r.status === 401) {
    tokens.clear()
    onUnauthorized()
  }
  if (r.status === 204) return undefined as T
  const body = await r.json().catch(() => null)
  if (!r.ok) throw new ApiError(r.status, errorMessage(body))
  return body as T
}

export const get = <T>(path: string) => api<T>(path)
export const post = <T>(path: string, json: unknown = {}) => api<T>(path, { method: 'POST', json })
export const put = <T>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json })
export const patch = <T>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json })
export const del = (path: string) => api<void>(path, { method: 'DELETE' })
