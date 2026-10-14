import { type FormEvent, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../services/api'
import { resolveDestination } from '../utils/resolveDestination'

/** Map an HTTP status (or null) from a failed login to a translation key. */
function loginErrorKey(status: number | null): string {
  if (status === 429) return 'login.error.tooManyAttempts'
  if (status === 401) return 'login.error.invalidCredentials'
  return 'login.error.generic'
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorKey(null)
    setSubmitting(true)
    try {
      const user = await login(email, password)
      navigate(resolveDestination(user, from), { replace: true })
    } catch (err) {
      const httpStatus = err instanceof ApiError ? err.status : null
      setErrorKey(loginErrorKey(httpStatus))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white text-xl font-bold shadow-lg">
            CF
          </div>
          <h1 className="text-xl font-bold text-gray-900">Campus Football</h1>
          <p className="text-sm text-gray-400">{t('login.tagline')}</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                {t('login.emailLabel')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
                placeholder={t('login.emailPlaceholder')}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                {t('login.passwordLabel')}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
                placeholder={t('login.passwordPlaceholder')}
              />
            </div>

            {errorKey && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
                {t(errorKey)}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60 transition"
            >
              {submitting ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
