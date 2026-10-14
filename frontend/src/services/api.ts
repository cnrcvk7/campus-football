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

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
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
// Token refresh — single in-flight promise to prevent concurrent storms
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) throw new Error('No refresh token available')

    const res = await fetch(`${BASE_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    })

    if (!res.ok) {
      throw new ApiError(res.status, 'Token refresh failed')
    }

    // ROTATE_REFRESH_TOKENS is enabled server-side: every successful refresh
    // returns a new refresh token and blacklists the old one.  Store the
    // replacement so subsequent calls use the current token.
    const data = (await res.json()) as { access: string; refresh?: string }
    localStorage.setItem(ACCESS_KEY, data.access)
    if (data.refresh) {
      localStorage.setItem(REFRESH_KEY, data.refresh)
    }
    return data.access
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
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

  // Attempt one token refresh on 401, but never for the refresh endpoint itself
  if (res.status === 401 && path !== '/auth/token/refresh/') {
    try {
      const newToken = await refreshAccessToken()
      const retryHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newToken}`,
        ...(options.headers as Record<string, string> | undefined),
      }
      const retryRes = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: retryHeaders,
      })

      if (!retryRes.ok) {
        let message = retryRes.statusText
        try {
          const body = await retryRes.json()
          message = typeof body === 'string' ? body : JSON.stringify(body)
        } catch {
          // ignore parse error
        }
        throw new ApiError(retryRes.status, message)
      }

      if (retryRes.status === 204) return undefined as T
      return retryRes.json() as Promise<T>
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status !== 401) {
          // The retry itself failed with a non-auth server error; surface it
          // without clearing tokens — the session may still be valid.
          throw err
        }
        // The server explicitly rejected the refresh token (401): force re-login.
        clearTokens()
        window.location.href = '/login'
      }
      // A non-ApiError (e.g. TypeError from a network failure) means we could
      // not reach the server.  Do NOT clear tokens — they may still be valid
      // once connectivity is restored.  Surface the error to the caller.
      throw err
    }
  }

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
