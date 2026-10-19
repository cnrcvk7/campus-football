import { Globe, LogIn, LogOut, Moon, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { cn } from '../../lib/utils'
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
    <div className="flex items-center gap-1 text-cf-nav-muted">
      <Globe
        size={13}
        aria-hidden="true"
        className="shrink-0"
      />
      <select
        value={i18n.language}
        onChange={handleChange}
        aria-label={t('language.ariaLabel')}
        className={cn(
          'cursor-pointer rounded border-0 bg-transparent text-xs outline-none',
          'text-cf-nav-muted transition hover:text-cf-nav-foreground focus:ring-0',
        )}
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option
            key={lng}
            value={lng}
            className="bg-cf-nav text-cf-nav-foreground"
          >
            {LANGUAGE_LABELS[lng]}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Theme toggle button
// ---------------------------------------------------------------------------

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useTranslation()

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')}
      title={theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-lg transition',
        'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
        'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
      )}
    >
      {theme === 'light' ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Nav link button
// ---------------------------------------------------------------------------

interface NavLinkProps {
  onClick: () => void
  children: React.ReactNode
}

function NavLink({ onClick, children }: NavLinkProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-sm transition',
        'text-cf-nav-muted hover:text-cf-nav-foreground',
      )}
    >
      {children}
    </button>
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
    <header
      className={cn(
        'sticky top-0 z-20 border-b transition-colors',
        'bg-cf-nav border-cf-nav-border',
        // Subtle shadow in light mode; none needed in dark (border is sufficient)
        'shadow-sm',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">

        {/* ── Left: logo + breadcrumb ─────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold',
              'bg-emerald-500 text-white transition hover:bg-emerald-600',
            )}
            aria-label={t('nav.goToDashboard')}
          >
            CF
          </button>
          {label && (
            <>
              <span className="text-cf-border">/</span>
              <span className="text-sm text-cf-nav-muted">{label}</span>
            </>
          )}
        </div>

        {/* ── Right: nav links + theme toggle + language ──────────────── */}
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <NavLink onClick={() => navigate('/players')}>
                {t('nav.players')}
              </NavLink>

              {isCoach && (
                <>
                  <NavLink onClick={() => navigate('/coach/academies')}>
                    {t('nav.academies')}
                  </NavLink>
                  <NavLink onClick={() => navigate('/coach/teams')}>
                    {t('nav.teams')}
                  </NavLink>
                  <NavLink onClick={() => navigate('/coach/sessions')}>
                    {t('nav.training')}
                  </NavLink>
                  <NavLink onClick={() => navigate('/coach/schedule')}>
                    {t('nav.schedule')}
                  </NavLink>
                  <NavLink onClick={() => navigate('/coach/matches')}>
                    {t('nav.matches')}
                  </NavLink>
                </>
              )}

              <button
                onClick={handleLogout}
                className={cn(
                  'flex items-center gap-1.5 text-xs transition',
                  'text-cf-nav-muted hover:text-cf-nav-foreground',
                )}
              >
                <LogOut size={13} aria-hidden="true" />
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-semibold transition',
                'bg-emerald-500 text-white hover:bg-emerald-600',
              )}
            >
              <LogIn size={14} aria-hidden="true" />
              {t('nav.signIn')}
            </button>
          )}

          <ThemeToggle />
          <LanguageSelector />
        </div>
      </div>
    </header>
  )
}
