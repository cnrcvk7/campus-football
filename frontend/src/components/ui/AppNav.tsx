import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from '../../i18n/storage'

interface AppNavProps {
  /** Breadcrumb label shown after the CF logo */
  label?: string
}

// ---------------------------------------------------------------------------
// Language selector
// ---------------------------------------------------------------------------

const LANGUAGE_LABELS: Record<(typeof SUPPORTED_LANGUAGES)[number], string> = {
  en: 'EN',
  tr: 'TR',
  ru: 'RU',
}

function LanguageSelector() {
  const { t, i18n } = useTranslation()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const lng = e.target.value
    void i18n.changeLanguage(lng)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
  }

  return (
    <select
      value={i18n.language}
      onChange={handleChange}
      aria-label={t('language.ariaLabel')}
      className="cursor-pointer rounded border-0 bg-transparent text-xs text-gray-500 outline-none transition hover:text-gray-800 focus:ring-0"
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <option key={lng} value={lng}>
          {LANGUAGE_LABELS[lng]}
        </option>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------------------
// AppNav
// ---------------------------------------------------------------------------

export default function AppNav({ label }: AppNavProps) {
  const navigate = useNavigate()
  const { isAuthenticated, user, logout } = useAuth()
  const { t } = useTranslation()

  const isCoach = user?.role === 'COACH' || user?.role === 'ACADEMY_ADMIN'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Left: logo + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white transition hover:bg-brand-700"
            aria-label={t('nav.goToDashboard')}
          >
            CF
          </button>
          {label && (
            <>
              <span className="text-gray-300">/</span>
              <span className="text-sm text-gray-500">{label}</span>
            </>
          )}
        </div>

        {/* Right: auth-aware actions + language selector */}
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <button
                onClick={() => navigate('/players')}
                className="text-sm text-gray-500 transition hover:text-gray-800"
              >
                {t('nav.players')}
              </button>
              {isCoach && (
                <>
                  <button
                    onClick={() => navigate('/coach/academies')}
                    className="text-sm text-gray-500 transition hover:text-gray-800"
                  >
                    {t('nav.academies')}
                  </button>
                  <button
                    onClick={() => navigate('/coach/teams')}
                    className="text-sm text-gray-500 transition hover:text-gray-800"
                  >
                    {t('nav.teams')}
                  </button>
                  <button
                    onClick={() => navigate('/coach/sessions')}
                    className="text-sm text-gray-500 transition hover:text-gray-800"
                  >
                    {t('nav.training')}
                  </button>
                  <button
                    onClick={() => navigate('/coach/matches')}
                    className="text-sm text-gray-500 transition hover:text-gray-800"
                  >
                    {t('nav.matches')}
                  </button>
                </>
              )}
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 transition hover:text-gray-600"
              >
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="rounded-xl bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {t('nav.signIn')}
            </button>
          )}

          <LanguageSelector />
        </div>
      </div>
    </header>
  )
}
