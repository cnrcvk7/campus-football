const BASE_URL = '/api'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

const ACCESS_KEY = 'cf_access_token'
const REFRESH_KEY = 'cf_refresh_token'

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// ---------------------------------------------------------------------------
// Core request function
// ---------------------------------------------------------------------------

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = typeof body === 'string' ? body : JSON.stringify(body)
    } catch {
      // ignore parse error
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, data: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path: string): Promise<void> =>
    request<void>(path, { method: 'DELETE' }),
}
